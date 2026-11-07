'use client';
import { useStudio, type EyedropTarget } from '@/store/studio';
import { DEFAULT_REFINE, type RGB, type Settings } from './core/types';
import { compositeRect } from './core/composite';
import { analyzeImage, borderNoise, chromaDefaultsFor, dominantBorderColor } from './core/detect';
import { hexToRgb, isChromatic, rgbToHex } from './core/color';
import { decodeImage, makeThumb } from './decode';
import { getModel, CUSTOM_MODEL_ID } from './ai/models';
import type { ExportOptions } from './exporter';
import { tr, type Key } from '@/i18n';

/** Workers send translation keys; errors from the export worker carry a code. */
function errText(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  if (m.startsWith('ENCODE_UNSUPPORTED:')) return tr('err.encode', { fmt: m.split(':')[1] });
  return m;
}

type Rect = { x0: number; y0: number; x1: number; y1: number };

type HistoryEntry =
  | { type: 'stroke'; rect: Rect; beforeE: Uint8Array; beforeP: Uint8Array; afterE: Uint8Array; afterP: Uint8Array; protectChanged: boolean }
  | { type: 'layers'; beforeE: Uint8Array; beforeP: Uint8Array; afterE: Uint8Array; afterP: Uint8Array }
  | { type: 'settings'; before: Settings; after: Settings };

const MAX_HISTORY = 60;

interface Pending {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  onStage?: (s: string) => void;
  onProgress?: (d: { stage: string; progress: number; backend?: string }) => void;
}

function cropLayer(src: Uint8Array, w: number, r: Rect): Uint8Array {
  const rw = r.x1 - r.x0;
  const out = new Uint8Array(rw * (r.y1 - r.y0));
  for (let y = r.y0; y < r.y1; y++) out.set(src.subarray(y * w + r.x0, y * w + r.x1), (y - r.y0) * rw);
  return out;
}
function pasteLayer(dst: Uint8Array, w: number, r: Rect, data: Uint8Array) {
  const rw = r.x1 - r.x0;
  for (let y = r.y0; y < r.y1; y++) dst.set(data.subarray((y - r.y0) * rw, (y - r.y0 + 1) * rw), y * w + r.x0);
}

class Engine {
  w = 0;
  h = 0;
  original: Uint8ClampedArray | null = null;
  processed: Uint8ClampedArray | null = null;
  final: Uint8ClampedArray | null = null;
  erase = new Uint8Array(0);
  protect = new Uint8Array(0);
  resultCanvas: HTMLCanvasElement | null = null;
  originalCanvas: HTMLCanvasElement | null = null;
  private maskCanvas: HTMLCanvasElement | null = null;
  private maskBuf: Uint8ClampedArray | null = null;
  private maskDirty: Rect | 'all' | null = 'all';
  private resultImage: ImageData | null = null;
  bgBitmap: ImageBitmap | null = null;
  customModel: ArrayBuffer | null = null;

  private proc: Worker | null = null;
  private ai: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private docGen = 0;
  private aiReadyFor: string | null = null;
  private aiRunning: string | null = null;
  private processInflight = false;
  private processQueued = false;

  private history: HistoryEntry[] = [];
  private redo: HistoryEntry[] = [];
  private settingsBase: Settings | null = null;
  private settingsTimer: ReturnType<typeof setTimeout> | null = null;
  private applyingHistory = false;

  private stroke: { tool: 'erase' | 'restore'; snapE: Uint8Array; snapP: Uint8Array; rect: Rect | null; last: { x: number; y: number } } | null = null;
  private initialized = false;

  init() {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;
    useStudio.subscribe((s, prev) => {
      if (s.settings !== prev.settings) this.onSettings(prev.settings, s.settings);
    });
  }

  get store() {
    return useStudio.getState();
  }

  // ───────────────────────── workers ─────────────────────────
  private procWorker(): Worker {
    if (!this.proc) {
      this.proc = new Worker(new URL('../workers/process.worker.ts', import.meta.url), { type: 'module' });
      this.proc.onmessage = (e) => this.onWorkerMessage(e.data);
      this.proc.onerror = (e) => this.store.toast('error', tr('toast.procWorker', { msg: e.message }));
    }
    return this.proc;
  }
  private aiWorker(): Worker {
    if (!this.ai) {
      this.ai = new Worker(new URL('../workers/ai.worker.ts', import.meta.url), { type: 'module' });
      this.ai.onmessage = (e) => this.onWorkerMessage(e.data);
      this.ai.onerror = (e) => this.store.toast('error', tr('toast.aiWorker', { msg: e.message }));
    }
    return this.ai;
  }
  private onWorkerMessage(m: any) {
    const p = this.pending.get(m.id);
    if (!p) return;
    switch (m.type) {
      case 'stage':
        p.onStage?.(m.stage);
        return;
      case 'progress':
        p.onProgress?.(m);
        return;
      case 'error':
        this.pending.delete(m.id);
        p.reject(new Error(m.message));
        return;
      default:
        this.pending.delete(m.id);
        p.resolve(m);
    }
  }
  private call<T = any>(worker: Worker, msg: Record<string, unknown>, transfer: Transferable[] = [], hooks: Omit<Pending, 'resolve' | 'reject'> = {}): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, ...hooks });
      worker.postMessage({ ...msg, id }, transfer);
    });
  }

  // ───────────────────────── loading ─────────────────────────
  async loadFile(file: File) {
    const st = this.store;
    st.set({ loading: { active: true, stage: tr('stage.decoding', { name: file.name }), progress: null } });
    try {
      const dec = await decodeImage(file);
      const gen = ++this.docGen;
      const { width: w, height: h, rgba } = dec;
      this.flushSettingsTimer();
      this.w = w;
      this.h = h;
      this.original = rgba;
      this.processed = null;
      this.final = new Uint8ClampedArray(w * h * 4);
      this.erase = new Uint8Array(w * h);
      this.protect = new Uint8Array(w * h);
      this.history = [];
      this.redo = [];
      this.aiReadyFor = null;
      this.aiRunning = null;
      this.maskBuf = null;
      this.maskDirty = 'all';
      this.setupCanvases();
      st.set({ loading: { active: true, stage: tr('stage.analyzing'), progress: null } });
      const analysis = analyzeImage(rgba, w, h);
      const thumb = makeThumb(rgba, w, h);
      this.procWorker().postMessage({ type: 'load', rgba: rgba.slice(), width: w, height: h });
      const key = analysis.border?.color ?? { r: 0, g: 177, b: 64 };
      const mode = analysis.suggestedMode;
      const base = st.settings;
      const settings: Settings = {
        ...base,
        mode,
        chroma: { ...base.chroma, key, ...analysis.chroma },
        pixel: { ...base.pixel, keys: [key] },
        refine: DEFAULT_REFINE[mode],
      };
      const stem = file.name.replace(/\.[^.]+$/, '') || 'image';
      const recent = [{ id: gen, name: file.name, thumb, file }, ...st.recent.filter((r) => r.name !== file.name || r.file.size !== file.size)].slice(0, 8);
      this.applyingHistory = true;
      st.set({
        doc: { id: gen, name: file.name, size: file.size, format: dec.format, width: w, height: h, thumb, notes: dec.notes, analysis },
        recent,
        settings,
        section: mode,
        tool: 'pan',
        processing: { active: false, stage: '', ms: null },
        ai: { ...st.ai, status: 'idle', stage: '', progress: null, error: null },
        exportOpts: { ...st.exportOpts, filename: `${stem}-nobg`, width: w, height: h, resample: mode === 'pixel' ? 'nearest' : 'smooth', preset: mode === 'pixel' ? 'sprite' : 'none' },
        loading: { active: false, stage: '', progress: null },
        history: { canUndo: false, canRedo: false },
      });
      this.applyingHistory = false;
      for (const n of dec.notes) st.toast('info', n);
      const label =
        mode === 'pixel' ? tr('toast.detectPixel')
        : mode === 'chroma' ? (analysis.kind === 'graphic' ? tr('toast.detectGraphic', { hex: rgbToHex(key) }) : tr('toast.detectSolid', { hex: rgbToHex(key) }))
        : analysis.kind === 'photo' ? tr('toast.detectPhoto') : tr('toast.detectComplex');
      st.toast('info', label);
      this.bump();
      this.refresh();
    } catch (err) {
      st.set({ loading: { active: false, stage: '', progress: null } });
      st.toast('error', errText(err));
    }
  }

  private setupCanvases() {
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = this.w;
      c.height = this.h;
      return c;
    };
    if (this.resultCanvas) this.resultCanvas.width = this.resultCanvas.height = 0;
    if (this.originalCanvas) this.originalCanvas.width = this.originalCanvas.height = 0;
    if (this.maskCanvas) this.maskCanvas.width = this.maskCanvas.height = 0;
    this.resultCanvas = mk();
    this.originalCanvas = mk();
    this.maskCanvas = null;
    this.originalCanvas.getContext('2d')!.putImageData(new ImageData(this.original! as Uint8ClampedArray<ArrayBuffer>, this.w, this.h), 0, 0);
    this.resultImage = new ImageData(this.final! as Uint8ClampedArray<ArrayBuffer>, this.w, this.h);
  }

  private bump() {
    useStudio.setState((s) => ({ tick: s.tick + 1 }));
  }

  // ───────────────────────── processing ─────────────────────────
  private onSettings(prev: Settings, next: Settings) {
    if (!this.original) return;
    if (!this.applyingHistory) {
      if (!this.settingsBase) this.settingsBase = prev;
      if (this.settingsTimer) clearTimeout(this.settingsTimer);
      this.settingsTimer = setTimeout(() => this.flushSettingsTimer(), 450);
    }
    this.refresh();
  }

  private flushSettingsTimer() {
    if (this.settingsTimer) clearTimeout(this.settingsTimer);
    this.settingsTimer = null;
    const base = this.settingsBase;
    this.settingsBase = null;
    if (!base || !this.original) return;
    const cur = this.store.settings;
    if (JSON.stringify(base) === JSON.stringify(cur)) return;
    this.pushHistory({ type: 'settings', before: base, after: cur });
  }

  private aiKey(s: Settings) {
    return s.ai.model === CUSTOM_MODEL_ID ? `custom:${this.customModel?.byteLength ?? 0}` : s.ai.model;
  }

  /** Decide what to (re)compute for the current settings. */
  refresh() {
    const s = this.store.settings;
    if (!this.original) return;
    if (s.mode === 'ai' && this.aiReadyFor !== this.aiKey(s)) {
      if (this.aiRunning !== this.aiKey(s)) void this.runAI();
      return;
    }
    this.requestProcess();
  }

  requestProcess() {
    if (!this.original) return;
    if (this.processInflight) {
      this.processQueued = true;
      return;
    }
    this.processInflight = true;
    this.processQueued = false;
    const gen = this.docGen;
    const settings = this.store.settings;
    this.store.set({ processing: { ...this.store.processing, active: true, stage: tr('stage.processing') } });
    this.call<{ rgba: Uint8ClampedArray; ms: number }>(this.procWorker(), { type: 'process', settings }, [], {
      onStage: (stage) => this.store.set({ processing: { ...this.store.processing, active: true, stage: tr(stage as Key) } }),
    })
      .then((res) => {
        if (gen !== this.docGen) return;
        this.processed = res.rgba;
        this.recomposite(null);
        this.store.set({ processing: { active: false, stage: '', ms: res.ms } });
      })
      .catch((err: Error) => {
        this.store.set({ processing: { active: false, stage: '', ms: null } });
        if (gen === this.docGen) this.store.toast('error', errText(err));
      })
      .finally(() => {
        this.processInflight = false;
        if (this.processQueued && gen === this.docGen) this.requestProcess();
      });
  }

  async runAI() {
    if (!this.original) return;
    const st = this.store;
    const s = st.settings;
    const key = this.aiKey(s);
    const model = s.ai.model === CUSTOM_MODEL_ID ? null : getModel(s.ai.model);
    if (s.ai.model === CUSTOM_MODEL_ID && !this.customModel) {
      st.set({ ai: { ...st.ai, status: 'error', error: tr('toast.customFirst') } });
      return;
    }
    if (!model && s.ai.model !== CUSTOM_MODEL_ID) return;
    const gen = this.docGen;
    this.aiRunning = key;
    st.set({ ai: { ...st.ai, status: 'loading', stage: tr('stage.aiStart'), progress: null, error: null } });
    const desc = model ?? { id: CUSTOM_MODEL_ID, url: '', inputSize: 1024, mean: 128, std: 256, normalizeOutput: true };
    try {
      const res = await this.call<{ mask: Uint8Array; backend: string; inferenceMs: number }>(
        this.aiWorker(),
        {
          type: 'run',
          assetBase: document.baseURI,
          model: { id: desc.id, url: desc.url, inputSize: desc.inputSize, mean: desc.mean, std: desc.std, normalizeOutput: desc.normalizeOutput },
          customModel: s.ai.model === CUSTOM_MODEL_ID ? this.customModel!.slice(0) : undefined,
          rgba: this.original.slice(),
          width: this.w,
          height: this.h,
        },
        [],
        {
          onProgress: (d) =>
            useStudio.setState((x) => ({ ai: { ...x.ai, status: d.stage === 'stage.running' ? 'running' : 'loading', stage: tr(d.stage as Key, { backend: d.backend ?? '' }), progress: d.progress } })),
        },
      );
      if (gen !== this.docGen) return;
      this.procWorker().postMessage({ type: 'ai-mask', mask: res.mask }, [res.mask.buffer]);
      this.aiReadyFor = key;
      useStudio.setState((x) => ({ ai: { ...x.ai, status: 'ready', stage: '', progress: null, backend: res.backend, ms: res.inferenceMs } }));
      if (this.store.settings.mode === 'ai') this.requestProcess();
    } catch (err) {
      if (gen !== this.docGen) return;
      const message = err instanceof Error ? err.message : String(err);
      useStudio.setState((x) => ({ ai: { ...x.ai, status: 'error', stage: '', error: message } }));
      st.toast('error', tr('toast.aiFailed', { msg: message }));
    } finally {
      if (this.aiRunning === key) this.aiRunning = null;
    }
  }

  async setCustomModel(file: File) {
    this.customModel = await file.arrayBuffer();
    this.aiReadyFor = null;
    useStudio.setState((x) => ({ ai: { ...x.ai, customName: file.name } }));
    this.store.setSettings((s) => ({ ...s, ai: { ...s.ai, model: CUSTOM_MODEL_ID } }));
  }

  /** Recompute final pixels (manual layers on top of the automatic result) and push them to the canvas. */
  private recomposite(r: Rect | null) {
    if (!this.original || !this.processed || !this.final || !this.resultCanvas) return;
    const rect = r ?? { x0: 0, y0: 0, x1: this.w, y1: this.h };
    compositeRect({ original: this.original, processed: this.processed, erase: this.erase, protect: this.protect }, this.final, this.w, rect.x0, rect.y0, rect.x1, rect.y1);
    const ctx = this.resultCanvas.getContext('2d')!;
    ctx.putImageData(this.resultImage!, 0, 0, rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0);
    if (r === null || this.maskDirty === 'all') this.maskDirty = 'all';
    else if (this.maskDirty === null) this.maskDirty = { ...rect };
    else this.maskDirty = { x0: Math.min(this.maskDirty.x0, rect.x0), y0: Math.min(this.maskDirty.y0, rect.y0), x1: Math.max(this.maskDirty.x1, rect.x1), y1: Math.max(this.maskDirty.y1, rect.y1) };
    this.bump();
  }

  /** White-on-transparent alpha canvas used for the mask view and overlay. */
  getMaskCanvas(): HTMLCanvasElement | null {
    if (!this.final || !this.w) return null;
    if (!this.maskCanvas) {
      this.maskCanvas = document.createElement('canvas');
      this.maskCanvas.width = this.w;
      this.maskCanvas.height = this.h;
      this.maskDirty = 'all';
    }
    if (this.maskDirty) {
      if (!this.maskBuf) this.maskBuf = new Uint8ClampedArray(this.w * this.h * 4).fill(255);
      const r = this.maskDirty === 'all' ? { x0: 0, y0: 0, x1: this.w, y1: this.h } : this.maskDirty;
      const f = this.final;
      const m = this.maskBuf;
      for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
        const o = (y * this.w + x) * 4 + 3;
        m[o] = f[o];
      }
      this.maskCanvas.getContext('2d')!.putImageData(new ImageData(m as Uint8ClampedArray<ArrayBuffer>, this.w, this.h), 0, 0, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
      this.maskDirty = null;
    }
    return this.maskCanvas;
  }

  pixelAt(x: number, y: number) {
    if (!this.original || !this.final || x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    const o = (Math.floor(y) * this.w + Math.floor(x)) * 4;
    return {
      x: Math.floor(x),
      y: Math.floor(y),
      original: Array.from(this.original.subarray(o, o + 4)),
      result: Array.from(this.final.subarray(o, o + 4)),
    };
  }

  // ───────────────────────── eyedropper ─────────────────────────
  pick(x: number, y: number, target: EyedropTarget) {
    const p = this.pixelAt(x, y);
    if (!p) return;
    const c: RGB = { r: p.original[0], g: p.original[1], b: p.original[2] };
    const st = this.store;
    const hex = rgbToHex(c);
    switch (target) {
      case 'chroma':
        st.setSettings((s) => ({ ...s, chroma: { ...s.chroma, key: c } }));
        break;
      case 'pixel':
        st.setSettings((s) => ({ ...s, pixel: { ...s.pixel, keys: [c] } }));
        break;
      case 'pixel-add':
        st.setSettings((s) =>
          s.pixel.keys.some((k) => k.r === c.r && k.g === c.g && k.b === c.b) ? s : { ...s, pixel: { ...s.pixel, keys: [...s.pixel.keys, c] } },
        );
        break;
      case 'preview-bg':
        st.setView({ bg: 'custom', custom: hex });
        break;
      case 'export-bg':
        st.setExport({ bgColor: hex, background: 'color' });
        break;
    }
    st.toast('info', tr('toast.picked', { hex: hex.toUpperCase(), x: p.x, y: p.y }));
  }

  /** One-click preset: finds the actual screen color in the image when it matches the preset hue. */
  applyPreset(name: 'green' | 'blue' | 'red' | 'white' | 'black' | 'auto') {
    if (!this.original) return;
    const st = this.store;
    const canon: Record<string, RGB> = { green: { r: 0, g: 177, b: 64 }, blue: { r: 0, g: 71, b: 187 }, red: { r: 200, g: 20, b: 30 }, white: { r: 255, g: 255, b: 255 }, black: { r: 0, g: 0, b: 0 } };
    const hues: Record<string, number> = { green: 120, blue: 225, red: 0 };
    let key: RGB;
    if (name === 'auto') key = dominantBorderColor(this.original, this.w, this.h)?.color ?? canon.green;
    else if (name in hues) key = dominantBorderColor(this.original, this.w, this.h, { hue: hues[name], range: 40, minChroma: 0.2 })?.color ?? canon[name];
    else {
      const d = dominantBorderColor(this.original, this.w, this.h);
      const want = canon[name];
      key = d && Math.abs(d.color.r - want.r) + Math.abs(d.color.g - want.g) + Math.abs(d.color.b - want.b) < 90 ? d.color : want;
    }
    // tolerance adapted to this image: colored screens match by hue, flat backgrounds use a tight RGB tolerance
    const kind = st.doc?.analysis.kind ?? 'photo';
    const screenPreset = name === 'green' || name === 'blue' || name === 'red';
    const tuned = chromaDefaultsFor(key, borderNoise(this.original, this.w, this.h, key), screenPreset && kind !== 'pixel' ? 'photo' : kind);
    const chromatic = isChromatic(key);
    st.setSettings((s) => {
      if (s.mode === 'pixel') return { ...s, pixel: { ...s.pixel, keys: [key] } };
      return {
        ...s,
        mode: 'chroma',
        chroma: { ...s.chroma, key, ...tuned },
        refine: s.mode === 'chroma' ? { ...s.refine, spill: chromatic ? 60 : 0 } : DEFAULT_REFINE.chroma,
      };
    });
    if (st.settings.mode !== 'pixel') st.set({ section: 'chroma' });
  }

  // ───────────────────────── brushes ─────────────────────────
  beginStroke(tool: 'erase' | 'restore', x: number, y: number) {
    if (!this.final || !this.processed) return;
    this.stroke = { tool, snapE: this.erase.slice(), snapP: this.protect.slice(), rect: null, last: { x, y } };
    this.dab(x, y);
  }

  strokeTo(x: number, y: number) {
    const s = this.stroke;
    if (!s) return;
    const { size } = this.store.brush;
    const step = Math.max(0.5, size * 0.2);
    const dx = x - s.last.x, dy = y - s.last.y;
    const dist = Math.hypot(dx, dy);
    if (dist < step) return;
    const n = Math.floor(dist / step);
    for (let i = 1; i <= n; i++) this.dab(s.last.x + (dx * i) / n, s.last.y + (dy * i) / n);
    s.last = { x, y };
  }

  private dab(cx: number, cy: number) {
    const s = this.stroke!;
    const { size, hardness } = this.store.brush;
    const pixelMode = this.store.settings.mode === 'pixel';
    const r = size / 2;
    const w = this.w, h = this.h;
    let rect: Rect;
    if (size <= 1.5) {
      const x = Math.floor(cx), y = Math.floor(cy);
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      this.applyCoverage(y * w + x, 255, s.tool);
      rect = { x0: x, y0: y, x1: x + 1, y1: y + 1 };
    } else {
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h, Math.ceil(cy + r));
      if (x0 >= x1 || y0 >= y1) return;
      const hard = pixelMode ? 1 : Math.min(0.999, hardness / 100);
      const inner = r * hard;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > r) continue;
        let c = 255;
        if (d > inner) {
          const t = 1 - (d - inner) / (r - inner);
          c = Math.round(t * t * (3 - 2 * t) * 255);
        }
        if (c > 0) this.applyCoverage(y * w + x, c, s.tool);
      }
      rect = { x0, y0, x1, y1 };
    }
    s.rect = s.rect ? { x0: Math.min(s.rect.x0, rect.x0), y0: Math.min(s.rect.y0, rect.y0), x1: Math.max(s.rect.x1, rect.x1), y1: Math.max(s.rect.y1, rect.y1) } : rect;
    this.recomposite(rect);
  }

  private applyCoverage(i: number, c: number, tool: 'erase' | 'restore') {
    if (tool === 'erase') {
      if (c > this.erase[i]) this.erase[i] = c;
      this.protect[i] = Math.round((this.protect[i] * (255 - c)) / 255);
    } else {
      if (c > this.protect[i]) this.protect[i] = c;
      this.erase[i] = Math.round((this.erase[i] * (255 - c)) / 255);
    }
  }

  endStroke() {
    const s = this.stroke;
    this.stroke = null;
    if (!s || !s.rect) return;
    const r = s.rect;
    const entry: HistoryEntry = {
      type: 'stroke',
      rect: r,
      beforeE: cropLayer(s.snapE, this.w, r),
      beforeP: cropLayer(s.snapP, this.w, r),
      afterE: cropLayer(this.erase, this.w, r),
      afterP: cropLayer(this.protect, this.w, r),
      protectChanged: s.tool === 'restore' || s.snapP.some((v, i) => v !== this.protect[i]),
    };
    this.pushHistory(entry);
    if (entry.protectChanged) this.syncProtect();
  }

  /** Protected areas also block the chroma / pixel-art flood fill, so the automatic pass respects them. */
  private syncProtect() {
    this.procWorker().postMessage({ type: 'protect', layer: this.protect.slice() });
    // AI mode does not flood-fill, so the composite alone already honours the protect layer
    if (this.store.settings.mode !== 'ai') this.requestProcess();
  }

  resetEdits() {
    if (!this.original) return;
    if (!this.erase.some((v) => v) && !this.protect.some((v) => v)) return;
    this.pushHistory({ type: 'layers', beforeE: this.erase.slice(), beforeP: this.protect.slice(), afterE: new Uint8Array(this.erase.length), afterP: new Uint8Array(this.protect.length) });
    this.erase.fill(0);
    this.protect.fill(0);
    this.recomposite(null);
    this.syncProtect();
    this.store.toast('info', tr('toast.editsCleared'));
  }

  /** Fill the whole manual layer: erase everything / restore everything (useful with invert workflows). */
  fillLayer(tool: 'erase' | 'restore') {
    if (!this.original) return;
    const beforeE = this.erase.slice(), beforeP = this.protect.slice();
    if (tool === 'erase') { this.erase.fill(255); this.protect.fill(0); } else { this.protect.fill(255); this.erase.fill(0); }
    this.pushHistory({ type: 'layers', beforeE, beforeP, afterE: this.erase.slice(), afterP: this.protect.slice() });
    this.recomposite(null);
    this.syncProtect();
  }

  // ───────────────────────── history ─────────────────────────
  private pushHistory(e: HistoryEntry) {
    if (e.type !== 'settings') this.flushSettingsTimer();
    this.history.push(e);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.redo = [];
    this.syncHistoryFlags();
  }
  private syncHistoryFlags() {
    this.store.set({ history: { canUndo: this.history.length > 0 || !!this.settingsTimer, canRedo: this.redo.length > 0 } });
  }
  private applyEntry(e: HistoryEntry, dir: 'undo' | 'redo') {
    if (e.type === 'settings') {
      this.applyingHistory = true;
      this.store.set({ settings: dir === 'undo' ? e.before : e.after, section: (dir === 'undo' ? e.before : e.after).mode });
      this.applyingHistory = false;
      return;
    }
    if (e.type === 'stroke') {
      pasteLayer(this.erase, this.w, e.rect, dir === 'undo' ? e.beforeE : e.afterE);
      pasteLayer(this.protect, this.w, e.rect, dir === 'undo' ? e.beforeP : e.afterP);
      this.recomposite(e.rect);
      if (e.protectChanged) this.syncProtect();
      return;
    }
    this.erase.set(dir === 'undo' ? e.beforeE : e.afterE);
    this.protect.set(dir === 'undo' ? e.beforeP : e.afterP);
    this.recomposite(null);
    this.syncProtect();
  }
  undo() {
    this.flushSettingsTimer();
    const e = this.history.pop();
    if (!e) return;
    this.applyEntry(e, 'undo');
    this.redo.push(e);
    this.syncHistoryFlags();
  }
  redoAction() {
    const e = this.redo.pop();
    if (!e) return;
    this.applyEntry(e, 'redo');
    this.history.push(e);
    this.syncHistoryFlags();
  }

  /** Bottom-bar reset: clears manual edits and restores default refinement for the current mode. */
  resetAll() {
    if (!this.original) return;
    this.flushSettingsTimer();
    const before = this.store.settings;
    const after = { ...before, refine: DEFAULT_REFINE[before.mode] };
    if (JSON.stringify(before.refine) !== JSON.stringify(after.refine)) {
      this.applyingHistory = true;
      this.store.set({ settings: after });
      this.applyingHistory = false;
      this.pushHistory({ type: 'settings', before, after });
    }
    this.resetEdits();
  }

  // ───────────────────────── export ─────────────────────────
  buildExportOptions(w: number, h: number): ExportOptions {
    const e = this.store.exportOpts;
    let width = w, height = h;
    if (e.sizeMode === 'scale') {
      width = Math.max(1, Math.round(w * e.scale));
      height = Math.max(1, Math.round(h * e.scale));
    } else if (e.sizeMode === 'custom') {
      width = Math.max(1, Math.min(16384, Math.round(e.width) || w));
      height = Math.max(1, Math.min(16384, Math.round(e.height) || h));
    }
    let background: ExportOptions['background'] = { type: 'transparent' };
    if (e.background === 'color' || e.format === 'jpeg') background = { type: 'color', color: hexToRgb(e.bgColor) };
    if (e.background === 'image' && this.bgBitmap) background = { type: 'image', bitmap: this.bgBitmap };
    return { format: e.format, width, height, resample: e.resample, background, quality: e.quality, pngFilter: e.pngFilter };
  }

  async download() {
    if (!this.final || !this.processed) {
      this.store.toast('error', tr('toast.nothing'));
      return;
    }
    const st = this.store;
    const opts = this.buildExportOptions(this.w, this.h);
    st.set({ exporting: true });
    try {
      const rgba = this.final.slice();
      const res = await this.call<{ blob: Blob }>(this.procWorker(), { type: 'export', rgba, width: this.w, height: this.h, options: opts }, [rgba.buffer]);
      const ext = opts.format === 'jpeg' ? 'jpg' : opts.format === 'tiff' ? 'tif' : opts.format;
      const name = (st.exportOpts.filename.trim() || 'image-nobg').replace(/[\\/:*?"<>|]+/g, '_').replace(/\.(png|jpe?g|webp|tiff?)$/i, '');
      saveBlob(res.blob, `${name}.${ext}`);
      st.toast('success', tr('toast.saved', { name: `${name}.${ext}`, w: opts.width, h: opts.height, mb: (res.blob.size / 1024 / 1024).toFixed(2) }));
    } catch (err) {
      st.toast('error', errText(err));
    } finally {
      st.set({ exporting: false });
    }
  }

  async setBackgroundImage(file: File | null) {
    const st = this.store;
    if (st.bgImage) URL.revokeObjectURL(st.bgImage.url);
    this.bgBitmap?.close();
    this.bgBitmap = null;
    if (!file) {
      st.set({ bgImage: null });
      if (st.view.bg === 'image') st.setView({ bg: 'checker' });
      if (st.exportOpts.background === 'image') st.setExport({ background: 'transparent' });
      return;
    }
    try {
      this.bgBitmap = await createImageBitmap(file);
      st.set({ bgImage: { name: file.name, url: URL.createObjectURL(file) } });
      st.setView({ bg: 'image' });
      st.setExport({ background: 'image', format: st.exportOpts.format === 'jpeg' ? 'jpeg' : st.exportOpts.format });
    } catch {
      st.toast('error', tr('toast.bgImage'));
    }
  }

  // ───────────────────────── batch ─────────────────────────
  async batch(files: File[], onItem: (i: number, status: string) => void): Promise<void> {
    const st = this.store;
    const settings = st.settings;
    const results: { name: string; blob: Blob }[] = [];
    const used = new Set<string>();
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        onItem(i, 'decoding');
        const dec = await decodeImage(f);
        let s: Settings = settings;
        // per-image auto key so each image's own screen color is used
        if (settings.mode !== 'ai') {
          const d = dominantBorderColor(dec.rgba, dec.width, dec.height);
          if (d && d.coverage > 0.3) s = settings.mode === 'chroma' ? { ...settings, chroma: { ...settings.chroma, key: d.color } } : { ...settings, pixel: { ...settings.pixel, keys: [d.color, ...settings.pixel.keys.slice(1)] } };
        }
        let aiMask: Uint8Array | null = null;
        if (settings.mode === 'ai') {
          onItem(i, 'ai');
          const model = getModel(settings.ai.model) ?? getModel('isnet-quint8')!;
          const res = await this.call<{ mask: Uint8Array }>(this.aiWorker(), {
            type: 'run', assetBase: document.baseURI,
            model: { id: model.id, url: model.url, inputSize: model.inputSize, mean: model.mean, std: model.std, normalizeOutput: model.normalizeOutput },
            rgba: dec.rgba, width: dec.width, height: dec.height,
          });
          aiMask = res.mask;
        }
        onItem(i, 'processing');
        const opts = this.buildExportOptions(dec.width, dec.height);
        const res = await this.call<{ blob: Blob }>(this.procWorker(), { type: 'batch', rgba: dec.rgba, width: dec.width, height: dec.height, settings: s, aiMask, options: opts }, [dec.rgba.buffer]);
        const ext = opts.format === 'jpeg' ? 'jpg' : opts.format === 'tiff' ? 'tif' : opts.format;
        let name = `${f.name.replace(/\.[^.]+$/, '')}-nobg.${ext}`;
        for (let k = 2; used.has(name); k++) name = `${f.name.replace(/\.[^.]+$/, '')}-nobg-${k}.${ext}`;
        used.add(name);
        results.push({ name, blob: res.blob });
        onItem(i, 'done');
      } catch (err) {
        onItem(i, `error:${errText(err)}`);
      }
    }
    if (!results.length) return;
    if (results.length === 1) {
      saveBlob(results[0].blob, results[0].name);
      return;
    }
    const zip = await this.call<{ blob: Blob }>(this.procWorker(), { type: 'zip', files: results });
    saveBlob(zip.blob, `mayinpix-batch-${results.length}.zip`);
    st.toast('success', tr('toast.batchDone', { n: results.length }));
  }
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

export const engine = new Engine();

// Exposed for automated end-to-end tests and debugging from the console.
if (typeof window !== 'undefined') (window as unknown as { __mayinpix: Engine }).__mayinpix = engine;
