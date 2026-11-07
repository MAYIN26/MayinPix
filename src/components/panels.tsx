'use client';
import { useRef } from 'react';
import {
  Sparkles, Pipette, Grid3x3, Eraser, Brush, Wand2, Download, Upload, Plus, X, Cpu, ShieldCheck, Layers, RotateCcw, ImagePlus, FlipHorizontal2, Images,
} from 'lucide-react';
import { useStudio } from '@/store/studio';
import { engine } from '@/lib/engine';
import { MODELS, CUSTOM_MODEL_ID } from '@/lib/ai/models';
import { hexToRgb, isChromatic, rgbToHex } from '@/lib/core/color';
import { Button, Card, Hint, Note, Progress, Segmented, Slider, Swatch, Toggle, cx } from './ui';
import { ACCEPT_ATTR, formatBytes } from '@/lib/decode';
import type { RefineParams } from '@/lib/core/types';
import { useT, type Key } from '@/i18n';

function useRefine() {
  const refine = useStudio((s) => s.settings.refine);
  const setSettings = useStudio((s) => s.setSettings);
  const set = (p: Partial<RefineParams>) => setSettings((s) => ({ ...s, refine: { ...s.refine, ...p } }));
  return [refine, set] as const;
}

function PickButton({ target, label }: { target: 'chroma' | 'pixel' | 'pixel-add' | 'preview-bg' | 'export-bg'; label?: string }) {
  const t = useT();
  const tool = useStudio((s) => s.tool);
  const eyedropTarget = useStudio((s) => s.eyedropTarget);
  const set = useStudio((s) => s.set);
  const active = tool === 'eyedropper' && eyedropTarget === target;
  return (
    <Button active={active} onClick={() => set({ tool: active ? 'pan' : 'eyedropper', eyedropTarget: target })} title={t('pick.title')}>
      <Pipette size={14} /> {active ? t('pick.active') : label ?? t('pick.default')}
    </Button>
  );
}

export function UploadPanel() {
  const t = useT();
  const doc = useStudio((s) => s.doc);
  const recent = useStudio((s) => s.recent);
  const set = useStudio((s) => s.set);
  const input = useRef<HTMLInputElement>(null);
  return (
    <Card title={t('upload.title')} icon={<Upload size={15} />}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-panel px-4 py-6 text-center transition-colors hover:border-accent hover:bg-accent-soft"
      >
        <ImagePlus size={22} className="text-accent" />
        <span className="text-xs font-medium">{t('upload.drop')}</span>
        <span className="text-[11px] text-faint">PNG · JPG · WEBP · BMP · GIF · AVIF</span>
      </button>
      <input ref={input} type="file" accept={ACCEPT_ATTR} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void engine.loadFile(f); e.target.value = ''; }} />
      {doc && (
        <div className="flex gap-3 rounded-xl border border-line bg-panel p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={doc.thumb} alt="" className="checker h-14 w-14 rounded-lg object-contain" />
          <div className="min-w-0 text-[11px] leading-5 text-muted">
            <div className="truncate text-xs font-medium text-fg" title={doc.name}>{doc.name}</div>
            <div>{doc.format} · {formatBytes(doc.size)}</div>
            <div>{doc.width} × {doc.height} px · {((doc.width * doc.height) / 1e6).toFixed(2)} MP</div>
            <div>{t('upload.detected')}: <span className="text-fg">{t(`kind.${doc.analysis.kind}` as Key)}</span></div>
          </div>
        </div>
      )}
      {recent.length > 1 && (
        <div>
          <div className="mb-1.5 text-[11px] text-faint">{t('upload.session')}</div>
          <div className="grid grid-cols-4 gap-1.5">
            {recent.map((r) => (
              <button key={r.id} type="button" title={r.name} onClick={() => void engine.loadFile(r.file)} className={cx('checker aspect-square overflow-hidden rounded-lg border', doc?.name === r.name ? 'border-accent' : 'border-line hover:border-line-strong')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.thumb} alt={r.name} className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        </div>
      )}
      <Button className="w-full" onClick={() => set({ batchOpen: true })}><Images size={14} /> {t('upload.batch')}</Button>
      <Note>{t('upload.local')}</Note>
    </Card>
  );
}

export function AiPanel() {
  const t = useT();
  const ai = useStudio((s) => s.ai);
  const params = useStudio((s) => s.settings.ai);
  const mode = useStudio((s) => s.settings.mode);
  const setSettings = useStudio((s) => s.setSettings);
  const setMode = useStudio((s) => s.setMode);
  const doc = useStudio((s) => s.doc);
  const fileRef = useRef<HTMLInputElement>(null);
  const model = MODELS.find((m) => m.id === params.model);
  const busy = ai.status === 'loading' || ai.status === 'running';
  return (
    <Card title={t('ai.title')} icon={<Sparkles size={15} />}>
      {mode !== 'ai' && <Button variant="primary" className="w-full" onClick={() => setMode('ai')} disabled={!doc}><Sparkles size={14} /> {t('ai.use')}</Button>}
      <div>
        <div className="mb-1.5 text-xs text-muted">{t('ai.model')}</div>
        <select
          className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs outline-none focus:border-accent"
          value={params.model}
          onChange={(e) => {
            if (e.target.value === CUSTOM_MODEL_ID && !engine.customModel) { fileRef.current?.click(); return; }
            setSettings((s) => ({ ...s, ai: { ...s.ai, model: e.target.value } }));
          }}
        >
          {MODELS.map((m) => <option key={m.id} value={m.id}>{t(`model.${m.id}.name` as Key)} · {m.sizeMB} MB</option>)}
          <option value={CUSTOM_MODEL_ID}>{ai.customName ? t('ai.custom', { name: ai.customName }) : t('ai.loadCustom')}</option>
        </select>
        <input ref={fileRef} type="file" accept=".onnx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void engine.setCustomModel(f); e.target.value = ''; }} />
        {model && <p className="mt-1.5 text-[11px] leading-relaxed text-faint">{t(`model.${model.id}.desc` as Key)} <span className="block">{t(model.remote ? 'model.license.bria' : 'model.license.imgly')}</span></p>}
        {params.model === CUSTOM_MODEL_ID && <p className="mt-1.5 text-[11px] text-faint">{t('ai.customNote')}</p>}
      </div>
      {busy && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-muted"><span>{ai.stage || t('ai.working')}</span>{ai.progress !== null && ai.progress < 1 && <span>{Math.round(ai.progress * 100)}%</span>}</div>
          <Progress value={ai.progress !== null && ai.progress < 1 ? ai.progress : null} />
        </div>
      )}
      {ai.status === 'ready' && mode === 'ai' && (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-[11px] text-muted">
          <Cpu size={13} className="text-success" /> {t('ai.ready', { backend: ai.backend.toUpperCase(), ms: ai.ms ?? 0 })}
        </div>
      )}
      {ai.status === 'error' && <Note tone="warn">{ai.error}</Note>}
      <Button className="w-full" disabled={!doc || busy} onClick={() => { if (mode !== 'ai') setMode('ai'); else void engine.runAI(); }}>
        <Wand2 size={14} /> {ai.status === 'ready' ? t('ai.rerun') : t('ai.detect')}
      </Button>
      <Toggle label={t('ai.smart')} hint={t('ai.smartHint')} checked={params.smartEdges} onChange={(v) => setSettings((s) => ({ ...s, ai: { ...s.ai, smartEdges: v } }))} />
      <Slider label={t('ai.radius')} min={1} max={24} value={params.edgeRadius} disabled={!params.smartEdges} onChange={(v) => setSettings((s) => ({ ...s, ai: { ...s.ai, edgeRadius: v } }))} />
      <Note>{t('ai.note', { size: doc ? `${doc.width}×${doc.height}` : t('ai.originalSize') })}</Note>
    </Card>
  );
}

const PRESETS = [
  { id: 'green', label: 'preset.green', color: '#00b140' },
  { id: 'blue', label: 'preset.blue', color: '#0047bb' },
  { id: 'white', label: 'preset.white', color: '#ffffff' },
  { id: 'black', label: 'preset.black', color: '#000000' },
  { id: 'red', label: 'preset.red', color: '#c8141e' },
] as const;

export function ChromaPanel() {
  const t = useT();
  const chroma = useStudio((s) => s.settings.chroma);
  const mode = useStudio((s) => s.settings.mode);
  const setSettings = useStudio((s) => s.setSettings);
  const setMode = useStudio((s) => s.setMode);
  const doc = useStudio((s) => s.doc);
  const set = (p: Partial<typeof chroma>) => setSettings((s) => ({ ...s, chroma: { ...s.chroma, ...p } }));
  const chromatic = isChromatic(chroma.key);
  const [refine, setRefine] = useRefine();
  return (
    <Card title={t('chroma.title')} icon={<Pipette size={15} />}>
      {mode !== 'chroma' && <Button variant="primary" className="w-full" onClick={() => setMode('chroma')} disabled={!doc}>{t('chroma.use')}</Button>}
      <div>
        <div className="mb-1.5 text-xs text-muted">{t('chroma.oneClick')}</div>
        <div className="grid grid-cols-3 gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" disabled={!doc} onClick={() => engine.applyPreset(p.id)} className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2 py-1.5 text-[11px] hover:border-line-strong disabled:opacity-40">
              <span className="h-3 w-3 rounded-sm border border-line-strong" style={{ background: p.color }} /> {t(p.label)}
            </button>
          ))}
          <button type="button" disabled={!doc} onClick={() => engine.applyPreset('auto')} className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-2 py-1.5 text-[11px] text-accent disabled:opacity-40">
            <Wand2 size={12} /> {t('common.auto')}
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="color" value={rgbToHex(chroma.key)} onChange={(e) => set({ key: hexToRgb(e.target.value) })} className="h-9 w-11" aria-label={t('chroma.keyColor')} />
        <div className="flex-1 font-mono text-[11px] text-muted">
          <div className="text-fg">{rgbToHex(chroma.key).toUpperCase()}</div>
          rgb({chroma.key.r}, {chroma.key.g}, {chroma.key.b})
        </div>
        <PickButton target="chroma" label={t('common.pick')} />
      </div>
      <Slider label={t('chroma.tolerance')} min={0} max={60} step={0.5} value={chroma.tolerance} onChange={(v) => set({ tolerance: v })} hint={t('chroma.toleranceHint')} />
      <Slider label={t('chroma.softness')} min={0} max={40} step={0.5} value={chroma.softness} onChange={(v) => set({ softness: v })} hint={t('chroma.softnessHint')} />
      <Slider label={t('chroma.hue')} min={0} max={100} value={chroma.hueSensitivity} disabled={!chromatic} onChange={(v) => set({ hueSensitivity: v })} hint={t('chroma.hueHint')} />
      <Slider label={t('chroma.sat')} min={0} max={60} value={chroma.satThreshold} disabled={!chromatic} onChange={(v) => set({ satThreshold: v })} hint={t('chroma.satHint')} />
      <Slider label={t('chroma.spill')} min={0} max={100} value={refine.spill} disabled={!chromatic} onChange={(v) => setRefine({ spill: v })} hint={t('chroma.spillHint')} />
      <Toggle label={t('chroma.matte')} hint={t('chroma.matteHint')} checked={chroma.matte} onChange={(v) => set({ matte: v })} />
      <Toggle label={<span className="flex items-center gap-1"><ShieldCheck size={12} /> {t('chroma.protect')}</span>} hint={t('chroma.protectHint')} checked={chroma.edgeConnected} onChange={(v) => set({ edgeConnected: v })} />
      {!chroma.edgeConnected && <Note tone="warn">{t('chroma.globalWarn')}</Note>}
    </Card>
  );
}

export function PixelPanel() {
  const t = useT();
  const pixel = useStudio((s) => s.settings.pixel);
  const mode = useStudio((s) => s.settings.mode);
  const setSettings = useStudio((s) => s.setSettings);
  const setMode = useStudio((s) => s.setMode);
  const doc = useStudio((s) => s.doc);
  const set = (p: Partial<typeof pixel>) => setSettings((s) => ({ ...s, pixel: { ...s.pixel, ...p } }));
  return (
    <Card title={t('pixel.title')} icon={<Grid3x3 size={15} />}>
      {mode !== 'pixel' && <Button variant="primary" className="w-full" onClick={() => setMode('pixel')} disabled={!doc}>{t('pixel.use')}</Button>}
      <Note>{t('pixel.note')}</Note>
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
          <span>{t('pixel.colors')}</span>
          <span className="text-[10px] text-faint">{t('pixel.shiftHint')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {pixel.keys.map((k, i) => (
            <div key={i} className="group relative">
              <Swatch color={rgbToHex(k)} title={rgbToHex(k)} />
              {pixel.keys.length > 1 && (
                <button type="button" aria-label={t('pixel.removeColor')} onClick={() => set({ keys: pixel.keys.filter((_, j) => j !== i) })} className="absolute -top-1.5 -right-1.5 hidden h-4 w-4 place-items-center rounded-full bg-raised text-muted group-hover:grid">
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
          <label className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg border border-dashed border-line-strong text-muted hover:text-fg" title={t('pixel.addColor')}>
            <Plus size={13} />
            <input type="color" className="sr-only" onChange={(e) => set({ keys: [...pixel.keys, hexToRgb(e.target.value)] })} />
          </label>
        </div>
        <div className="mt-2 flex gap-1.5">
          <PickButton target="pixel" label={t('common.pick')} />
          <PickButton target="pixel-add" label={t('common.add')} />
          <Button onClick={() => engine.applyPreset('auto')} disabled={!doc}><Wand2 size={14} /> {t('common.auto')}</Button>
        </div>
      </div>
      <Toggle label={t('pixel.exact')} checked={pixel.exact} onChange={(v) => set({ exact: v })} />
      <Slider label={t('pixel.distance')} min={0} max={120} value={pixel.distance} disabled={pixel.exact} onChange={(v) => set({ distance: v })} hint={t('pixel.distanceHint')} />
      <Toggle label={t('pixel.connected')} hint={t('pixel.connectedHint')} checked={pixel.connected} onChange={(v) => set({ connected: v })} />
      <Toggle label={t('pixel.diagonal')} disabled={!pixel.connected} hint={t('pixel.diagonalHint')} checked={pixel.diagonal} onChange={(v) => set({ diagonal: v })} />
    </Card>
  );
}

export function ManualPanel() {
  const t = useT();
  const tool = useStudio((s) => s.tool);
  const brush = useStudio((s) => s.brush);
  const set = useStudio((s) => s.set);
  const mode = useStudio((s) => s.settings.mode);
  const view = useStudio((s) => s.view);
  const setView = useStudio((s) => s.setView);
  const [refine, setRefine] = useRefine();
  return (
    <Card title={t('manual.title')} icon={<Brush size={15} />}>
      <Segmented
        value={tool === 'erase' || tool === 'restore' ? tool : ('none' as never)}
        onChange={(t) => set({ tool: t })}
        options={[
          { value: 'erase', label: <><Eraser size={13} /> {t('manual.eraser')}</>, title: t('tool.erase') },
          { value: 'restore', label: <><Brush size={13} /> {t('manual.restore')}</>, title: t('tool.restore') },
        ]}
      />
      <Slider label={t('manual.size')} min={1} max={400} value={brush.size} suffix=" px" onChange={(v) => set({ brush: { ...brush, size: v } })} hint={t('manual.sizeHint')} />
      <Slider label={t('manual.hardness')} min={0} max={100} value={brush.hardness} disabled={mode === 'pixel'} onChange={(v) => set({ brush: { ...brush, hardness: v } })} hint={mode === 'pixel' ? t('manual.hardHintPixel') : t('manual.hardHint')} />
      <Note>
        <b className="text-fg">{t('manual.restore')}</b> {t('manual.note')}
      </Note>
      <div className="grid grid-cols-2 gap-1.5">
        <Button onClick={() => setRefine({ invert: !refine.invert })} active={refine.invert}><FlipHorizontal2 size={14} /> {t('manual.invert')}</Button>
        <Button onClick={() => setView({ mode: view.mode === 'mask' ? 'result' : 'mask' })} active={view.mode === 'mask'}><Layers size={14} /> {t('manual.maskView')}</Button>
        <Button onClick={() => engine.fillLayer('restore')}>{t('manual.restoreAll')}</Button>
        <Button onClick={() => engine.fillLayer('erase')}>{t('manual.eraseAll')}</Button>
      </div>
      <Toggle label={t('manual.overlay')} checked={view.overlay} onChange={(v) => setView({ overlay: v })} hint={t('manual.overlayHint')} />
      <Slider label={t('manual.overlayOpacity')} min={10} max={100} value={view.overlayOpacity} disabled={!view.overlay} onChange={(v) => setView({ overlayOpacity: v })} />
      <Button variant="danger" className="w-full" onClick={() => engine.resetEdits()}><RotateCcw size={14} /> {t('manual.reset')}</Button>
    </Card>
  );
}

export function RefinePanel() {
  const t = useT();
  const [refine, setRefine] = useRefine();
  const mode = useStudio((s) => s.settings.mode);
  const pixel = mode === 'pixel';
  const chromaKey = useStudio((s) => s.settings.chroma.key);
  const setSettings = useStudio((s) => s.setSettings);
  return (
    <Card title={t('refine.title')} icon={<Wand2 size={15} />}>
      {pixel && <Note>{t('refine.pixelNote')}</Note>}
      <Slider label={t('refine.low')} min={0} max={254} value={refine.alphaLow} disabled={pixel} onChange={(v) => setRefine({ alphaLow: Math.min(v, refine.alphaHigh - 1) })} hint={t('refine.lowHint')} />
      <Slider label={t('refine.high')} min={1} max={255} value={refine.alphaHigh} disabled={pixel} onChange={(v) => setRefine({ alphaHigh: Math.max(v, refine.alphaLow + 1) })} hint={t('refine.highHint')} />
      <Slider label={t('refine.shift')} min={-20} max={20} value={refine.shift} suffix=" px" onChange={(v) => setRefine({ shift: v })} hint={t('refine.shiftHint')} />
      <Slider label={t('refine.feather')} min={0} max={20} step={0.5} value={refine.feather} disabled={pixel} onChange={(v) => setRefine({ feather: v })} hint={t('refine.featherHint')} />
      <Slider label={t('refine.residue')} min={0} max={5000} step={8} value={refine.residueSize} suffix=" px" onChange={(v) => setRefine({ residueSize: v })} hint={t('refine.residueHint')} />
      <Slider label={t('refine.holes')} min={0} max={5000} step={8} value={refine.holeSize} suffix=" px" onChange={(v) => setRefine({ holeSize: v })} hint={t('refine.holesHint')} />
      <Toggle label={t('refine.decont')} checked={refine.decontaminate} onChange={(v) => setRefine({ decontaminate: v })} hint={t('refine.decontHint')} />
      <div className="space-y-2.5 rounded-xl border border-line p-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          {t('refine.spillTitle')} <Hint text={t('refine.spillHint')} />
          <input type="color" className="ml-auto h-6 w-8" value={rgbToHex(chromaKey)} onChange={(e) => setSettings((s) => ({ ...s, chroma: { ...s.chroma, key: hexToRgb(e.target.value) } }))} aria-label={t('refine.spillColor')} />
        </div>
        <Slider label={t('refine.amount')} min={0} max={100} value={refine.spill} onChange={(v) => setRefine({ spill: v })} />
        <Segmented size="sm" value={refine.spillScope} onChange={(v) => setRefine({ spillScope: v })} options={[{ value: 'edges', label: t('refine.edges') }, { value: 'all', label: t('refine.all') }]} />
      </div>
      <Toggle label={t('refine.invert')} checked={refine.invert} onChange={(v) => setRefine({ invert: v })} />
    </Card>
  );
}

export function ExportPanel({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const e = useStudio((s) => s.exportOpts);
  const setExport = useStudio((s) => s.setExport);
  const doc = useStudio((s) => s.doc);
  const bgImage = useStudio((s) => s.bgImage);
  const exporting = useStudio((s) => s.exporting);
  const bgRef = useRef<HTMLInputElement>(null);
  const W = doc?.width ?? 0, H = doc?.height ?? 0;
  const outW = e.sizeMode === 'original' ? W : e.sizeMode === 'scale' ? Math.round(W * e.scale) : e.width;
  const outH = e.sizeMode === 'original' ? H : e.sizeMode === 'scale' ? Math.round(H * e.scale) : e.height;
  const applyPreset = (p: typeof e.preset) => {
    if (p === 'sprite') setExport({ preset: p, format: 'png', resample: 'nearest', background: 'transparent', sizeMode: 'original', pngFilter: 'adaptive' });
    if (p === 'illustration') setExport({ preset: p, format: 'png', resample: 'smooth', background: 'transparent', sizeMode: 'original' });
    if (p === 'photo') setExport({ preset: p, format: 'webp', resample: 'smooth', background: 'transparent', sizeMode: 'original', quality: 0.95 });
  };
  return (
    <Card title={t('export.title')} icon={<Download size={15} />}>
      {!compact && (
        <div>
          <div className="mb-1.5 text-xs text-muted">{t('export.presets')}</div>
          <Segmented size="sm" value={e.preset} onChange={applyPreset} options={[{ value: 'sprite', label: t('export.sprite') }, { value: 'illustration', label: t('export.illustration') }, { value: 'photo', label: t('export.photo') }]} />
        </div>
      )}
      <div>
        <div className="mb-1.5 text-xs text-muted">{t('export.format')}</div>
        <Segmented
          value={e.format}
          onChange={(f) => {
            const force = f === 'jpeg' && e.background === 'transparent';
            const unforce = f !== 'jpeg' && e.format === 'jpeg' && e.bgForced && e.background === 'color';
            setExport({ format: f, preset: 'none', background: force ? 'color' : unforce ? 'transparent' : e.background, bgForced: force || (f === 'jpeg' && e.bgForced) });
          }}
          options={[{ value: 'png', label: 'PNG' }, { value: 'webp', label: 'WEBP' }, { value: 'jpeg', label: 'JPG' }, { value: 'tiff', label: 'TIFF' }]}
        />
        <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
          {t(`export.${e.format}Desc` as Key)}
        </p>
      </div>
      {(e.format === 'webp' || e.format === 'jpeg') && (
        <Slider label={t('export.quality')} min={50} max={100} value={Math.round(e.quality * 100)} onChange={(v) => setExport({ quality: v / 100 })} />
      )}
      {e.format === 'png' && !compact && (
        <Segmented size="sm" value={e.pngFilter} onChange={(v) => setExport({ pngFilter: v })} options={[{ value: 'adaptive', label: t('export.smallest') }, { value: 'none', label: t('export.fastest') }]} />
      )}
      <div>
        <div className="mb-1.5 text-xs text-muted">{t('export.background')}</div>
        <Segmented
          value={e.background}
          onChange={(v) => { if (v === 'image' && !bgImage) bgRef.current?.click(); else setExport({ background: v, bgForced: false }); }}
          options={[
            ...(e.format === 'jpeg' ? [] : [{ value: 'transparent' as const, label: t('export.transparent') }]),
            { value: 'color' as const, label: t('export.color') },
            { value: 'image' as const, label: t('export.image') },
          ]}
        />
        {(e.background === 'color' || (e.format === 'jpeg' && e.background === 'transparent')) && (
          <div className="mt-2 flex items-center gap-2">
            <input type="color" value={e.bgColor} onChange={(ev) => setExport({ bgColor: ev.target.value })} className="h-8 w-10" aria-label={t('export.bgColor')} />
            {['#ffffff', '#000000', '#f3f4f6', '#1f2937'].map((c) => <Swatch key={c} color={c} selected={e.bgColor === c} onClick={() => setExport({ bgColor: c })} title={c} />)}
            <PickButton target="export-bg" label="" />
          </div>
        )}
        {e.background === 'image' && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
            {bgImage ? <span className="flex-1 truncate">{bgImage.name}</span> : <span className="flex-1">{t('export.noImage')}</span>}
            <Button onClick={() => bgRef.current?.click()}>{t('export.choose')}</Button>
            {bgImage && <Button variant="ghost" onClick={() => void engine.setBackgroundImage(null)}><X size={13} /></Button>}
          </div>
        )}
        <input ref={bgRef} type="file" accept="image/*" hidden onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void engine.setBackgroundImage(f); ev.target.value = ''; }} />
      </div>
      <div>
        <div className="mb-1.5 text-xs text-muted">{t('export.size')}</div>
        <Segmented size="sm" value={e.sizeMode} onChange={(v) => setExport({ sizeMode: v, width: e.width || W, height: e.height || H })} options={[{ value: 'original', label: t('export.original') }, { value: 'scale', label: t('export.scale') }, { value: 'custom', label: t('export.custom') }]} />
        {e.sizeMode === 'scale' && (
          <div className="mt-2 grid grid-cols-5 gap-1">
            {[0.25, 0.5, 2, 4, 8].map((s) => (
              <Button key={s} active={e.scale === s} onClick={() => setExport({ scale: s })} className="!px-1">{s}×</Button>
            ))}
          </div>
        )}
        {e.sizeMode === 'custom' && (
          <div className="mt-2 flex items-center gap-1.5">
            <input type="number" min={1} max={16384} value={e.width} aria-label={t('export.width')} onChange={(ev) => { const v = Number(ev.target.value); setExport({ width: v, height: e.lockRatio && W ? Math.round((v * H) / W) : e.height }); }} className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-xs outline-none focus:border-accent" />
            <button type="button" className={cx('rounded-md px-1 text-xs', e.lockRatio ? 'text-accent' : 'text-faint')} onClick={() => setExport({ lockRatio: !e.lockRatio })} title={t('export.lock')}>🔗</button>
            <input type="number" min={1} max={16384} value={e.height} aria-label={t('export.height')} onChange={(ev) => { const v = Number(ev.target.value); setExport({ height: v, width: e.lockRatio && H ? Math.round((v * W) / H) : e.width }); }} className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-xs outline-none focus:border-accent" />
          </div>
        )}
        {e.sizeMode !== 'original' && (
          <div className="mt-2">
            <Segmented size="sm" value={e.resample} onChange={(v) => setExport({ resample: v })} options={[{ value: 'nearest', label: t('export.nearest') }, { value: 'smooth', label: t('export.smooth') }]} />
          </div>
        )}
        {doc && <p className="mt-1.5 font-mono text-[11px] text-faint">{t('export.output', { w: outW, h: outH })} {e.sizeMode === 'original' && t('export.originalRes')}</p>}
      </div>
      <div>
        <div className="mb-1.5 text-xs text-muted">{t('export.filename')}</div>
        <div className="flex items-center rounded-lg border border-line bg-panel pr-2 focus-within:border-accent">
          <input value={e.filename} onChange={(ev) => setExport({ filename: ev.target.value })} className="w-full bg-transparent px-2 py-1.5 text-xs outline-none" aria-label={t('export.filename')} />
          <span className="text-[11px] text-faint">.{e.format === 'jpeg' ? 'jpg' : e.format === 'tiff' ? 'tif' : e.format}</span>
        </div>
      </div>
      <Button variant="primary" className="w-full !py-3 text-sm font-semibold tracking-wide" disabled={!doc || exporting} onClick={() => void engine.download()}>
        <Download size={16} /> {exporting ? t('common.encoding') : t('common.download')}
      </Button>
    </Card>
  );
}
