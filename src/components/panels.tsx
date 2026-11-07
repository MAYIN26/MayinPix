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

function useRefine() {
  const refine = useStudio((s) => s.settings.refine);
  const setSettings = useStudio((s) => s.setSettings);
  const set = (p: Partial<RefineParams>) => setSettings((s) => ({ ...s, refine: { ...s.refine, ...p } }));
  return [refine, set] as const;
}

function PickButton({ target, label = 'Pick from image' }: { target: 'chroma' | 'pixel' | 'pixel-add' | 'preview-bg' | 'export-bg'; label?: string }) {
  const tool = useStudio((s) => s.tool);
  const eyedropTarget = useStudio((s) => s.eyedropTarget);
  const set = useStudio((s) => s.set);
  const active = tool === 'eyedropper' && eyedropTarget === target;
  return (
    <Button active={active} onClick={() => set({ tool: active ? 'pan' : 'eyedropper', eyedropTarget: target })} title="Eyedropper: click anywhere on the image">
      <Pipette size={14} /> {active ? 'Click the image…' : label}
    </Button>
  );
}

export function UploadPanel() {
  const doc = useStudio((s) => s.doc);
  const recent = useStudio((s) => s.recent);
  const set = useStudio((s) => s.set);
  const input = useRef<HTMLInputElement>(null);
  return (
    <Card title="Upload image" icon={<Upload size={15} />}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-panel px-4 py-6 text-center transition-colors hover:border-accent hover:bg-accent-soft"
      >
        <ImagePlus size={22} className="text-accent" />
        <span className="text-xs font-medium">Drop, paste (Ctrl+V) or browse</span>
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
          </div>
        </div>
      )}
      {recent.length > 1 && (
        <div>
          <div className="mb-1.5 text-[11px] text-faint">This session</div>
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
      <Button className="w-full" onClick={() => set({ batchOpen: true })}><Images size={14} /> Batch process multiple images</Button>
      <Note>Images are processed locally in your browser. Nothing is uploaded to a server.</Note>
    </Card>
  );
}

export function AiPanel() {
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
    <Card title="AI background removal" icon={<Sparkles size={15} />}>
      {mode !== 'ai' && <Button variant="primary" className="w-full" onClick={() => setMode('ai')} disabled={!doc}><Sparkles size={14} /> Use AI removal</Button>}
      <div>
        <div className="mb-1.5 text-xs text-muted">Segmentation model</div>
        <select
          className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs outline-none focus:border-accent"
          value={params.model}
          onChange={(e) => {
            if (e.target.value === CUSTOM_MODEL_ID && !engine.customModel) { fileRef.current?.click(); return; }
            setSettings((s) => ({ ...s, ai: { ...s.ai, model: e.target.value } }));
          }}
        >
          {MODELS.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.sizeMB} MB</option>)}
          <option value={CUSTOM_MODEL_ID}>{ai.customName ? `Custom: ${ai.customName}` : 'Load custom ONNX model…'}</option>
        </select>
        <input ref={fileRef} type="file" accept=".onnx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void engine.setCustomModel(f); e.target.value = ''; }} />
        {model && <p className="mt-1.5 text-[11px] leading-relaxed text-faint">{model.description} <span className="block">{model.license}</span></p>}
        {params.model === CUSTOM_MODEL_ID && <p className="mt-1.5 text-[11px] text-faint">Custom models must take a 1×3×1024×1024 float input and output a 1-channel mask (ISNet / RMBG convention).</p>}
      </div>
      {busy && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-muted"><span>{ai.stage || 'Working…'}</span>{ai.progress !== null && ai.progress < 1 && <span>{Math.round(ai.progress * 100)}%</span>}</div>
          <Progress value={ai.progress !== null && ai.progress < 1 ? ai.progress : null} />
        </div>
      )}
      {ai.status === 'ready' && mode === 'ai' && (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-[11px] text-muted">
          <Cpu size={13} className="text-success" /> Mask ready · {ai.backend.toUpperCase()} · {ai.ms} ms
        </div>
      )}
      {ai.status === 'error' && <Note tone="warn">{ai.error}</Note>}
      <Button className="w-full" disabled={!doc || busy} onClick={() => { if (mode !== 'ai') setMode('ai'); else void engine.runAI(); }}>
        <Wand2 size={14} /> {ai.status === 'ready' ? 'Re-run detection' : 'Detect subject'}
      </Button>
      <Toggle label="Smart edge refinement" hint="Edge-aware guided filter: snaps the AI mask to real edges in the full-resolution original (hair, fur, outlines)." checked={params.smartEdges} onChange={(v) => setSettings((s) => ({ ...s, ai: { ...s.ai, smartEdges: v } }))} />
      <Slider label="Edge detail radius" min={1} max={24} value={params.edgeRadius} disabled={!params.smartEdges} onChange={(v) => setSettings((s) => ({ ...s, ai: { ...s.ai, edgeRadius: v } }))} />
      <Note>The model analyses a 1024 px copy; the resulting mask is upscaled to {doc ? `${doc.width}×${doc.height}` : 'the original size'} and applied to the original pixels. Use the Restore / Eraser brushes for any remaining mistakes.</Note>
    </Card>
  );
}

const PRESETS = [
  { id: 'green', label: 'Green', color: '#00b140' },
  { id: 'blue', label: 'Blue', color: '#0047bb' },
  { id: 'white', label: 'White', color: '#ffffff' },
  { id: 'black', label: 'Black', color: '#000000' },
  { id: 'red', label: 'Red', color: '#c8141e' },
] as const;

export function ChromaPanel() {
  const chroma = useStudio((s) => s.settings.chroma);
  const mode = useStudio((s) => s.settings.mode);
  const setSettings = useStudio((s) => s.setSettings);
  const setMode = useStudio((s) => s.setMode);
  const doc = useStudio((s) => s.doc);
  const set = (p: Partial<typeof chroma>) => setSettings((s) => ({ ...s, chroma: { ...s.chroma, ...p } }));
  const chromatic = isChromatic(chroma.key);
  const [refine, setRefine] = useRefine();
  return (
    <Card title="Color key / green screen" icon={<Pipette size={15} />}>
      {mode !== 'chroma' && <Button variant="primary" className="w-full" onClick={() => setMode('chroma')} disabled={!doc}>Use color key</Button>}
      <div>
        <div className="mb-1.5 text-xs text-muted">One-click removal</div>
        <div className="grid grid-cols-3 gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" disabled={!doc} onClick={() => engine.applyPreset(p.id)} className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2 py-1.5 text-[11px] hover:border-line-strong disabled:opacity-40">
              <span className="h-3 w-3 rounded-sm border border-line-strong" style={{ background: p.color }} /> {p.label}
            </button>
          ))}
          <button type="button" disabled={!doc} onClick={() => engine.applyPreset('auto')} className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-2 py-1.5 text-[11px] text-accent disabled:opacity-40">
            <Wand2 size={12} /> Auto
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="color" value={rgbToHex(chroma.key)} onChange={(e) => set({ key: hexToRgb(e.target.value) })} className="h-9 w-11" aria-label="Key color" />
        <div className="flex-1 font-mono text-[11px] text-muted">
          <div className="text-fg">{rgbToHex(chroma.key).toUpperCase()}</div>
          rgb({chroma.key.r}, {chroma.key.g}, {chroma.key.b})
        </div>
        <PickButton target="chroma" label="Pick" />
      </div>
      <Slider label="Color tolerance" min={0} max={60} step={0.5} value={chroma.tolerance} onChange={(v) => set({ tolerance: v })} hint="Pixels closer than this to the key color become fully transparent." />
      <Slider label="Edge softness" min={0} max={40} step={0.5} value={chroma.softness} onChange={(v) => set({ softness: v })} hint="Width of the semi-transparent transition above the tolerance." />
      <Slider label="Hue sensitivity" min={0} max={100} value={chroma.hueSensitivity} disabled={!chromatic} onChange={(v) => set({ hueSensitivity: v })} hint="High = match by hue (handles uneven lighting on the screen). Low = match by exact RGB. Only for colored keys." />
      <Slider label="Saturation threshold" min={0} max={60} value={chroma.satThreshold} disabled={!chromatic} onChange={(v) => set({ satThreshold: v })} hint="Pixels less saturated than this are never removed: protects greys, whites and skin from a colored key." />
      <Slider label="Spill suppression" min={0} max={100} value={refine.spill} disabled={!chromatic} onChange={(v) => setRefine({ spill: v })} hint="Removes the key color reflected onto the subject's edges. Keeps luminance." />
      <Toggle label="Soft edge matte" disabled={!chromatic} hint="Color-difference matte: edge pixels that are a mix of subject and screen become partially transparent and are cleaned of the screen color, removing colored fringes." checked={chroma.matte} onChange={(v) => set({ matte: v })} />
      <Toggle label={<span className="flex items-center gap-1"><ShieldCheck size={12} /> Protect subject interior</span>} hint="Only removes key-colored regions connected to the image border. Same-colored areas inside the subject are kept." checked={chroma.edgeConnected} onChange={(v) => set({ edgeConnected: v })} />
      {!chroma.edgeConnected && <Note tone="warn">Global keying removes every matching pixel, including matching colors inside the subject.</Note>}
    </Card>
  );
}

export function PixelPanel() {
  const pixel = useStudio((s) => s.settings.pixel);
  const mode = useStudio((s) => s.settings.mode);
  const setSettings = useStudio((s) => s.setSettings);
  const setMode = useStudio((s) => s.setMode);
  const doc = useStudio((s) => s.doc);
  const set = (p: Partial<typeof pixel>) => setSettings((s) => ({ ...s, pixel: { ...s.pixel, ...p } }));
  return (
    <Card title="Precision pixel art" icon={<Grid3x3 size={15} />}>
      {mode !== 'pixel' && <Button variant="primary" className="w-full" onClick={() => setMode('pixel')} disabled={!doc}>Use Pixel Art mode</Button>}
      <Note>Binary transparency, no anti-aliasing, no interpolation, no new colors. Every kept pixel is bit-identical to the source.</Note>
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
          <span>Background colors</span>
          <span className="text-[10px] text-faint">Shift+click with picker adds</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {pixel.keys.map((k, i) => (
            <div key={i} className="group relative">
              <Swatch color={rgbToHex(k)} title={rgbToHex(k)} />
              {pixel.keys.length > 1 && (
                <button type="button" aria-label="Remove color" onClick={() => set({ keys: pixel.keys.filter((_, j) => j !== i) })} className="absolute -top-1.5 -right-1.5 hidden h-4 w-4 place-items-center rounded-full bg-raised text-muted group-hover:grid">
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
          <label className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg border border-dashed border-line-strong text-muted hover:text-fg" title="Add color">
            <Plus size={13} />
            <input type="color" className="sr-only" onChange={(e) => set({ keys: [...pixel.keys, hexToRgb(e.target.value)] })} />
          </label>
        </div>
        <div className="mt-2 flex gap-1.5">
          <PickButton target="pixel" label="Pick" />
          <PickButton target="pixel-add" label="Add" />
          <Button onClick={() => engine.applyPreset('auto')} disabled={!doc}><Wand2 size={14} /> Auto</Button>
        </div>
      </div>
      <Toggle label="Exact color match (zero tolerance)" checked={pixel.exact} onChange={(v) => set({ exact: v })} />
      <Slider label="Color distance" min={0} max={120} value={pixel.distance} disabled={pixel.exact} onChange={(v) => set({ distance: v })} hint="RGB distance. Raise slightly for JPEG-compressed sprites or dithered backgrounds." />
      <Toggle label="Remove only border-connected regions" hint="Flood fill from the edges: the same color inside the sprite (eyes, gems) is kept." checked={pixel.connected} onChange={(v) => set({ connected: v })} />
      <Toggle label="Diagonal connectivity" disabled={!pixel.connected} hint="Lets the flood pass through diagonal gaps between pixels." checked={pixel.diagonal} onChange={(v) => set({ diagonal: v })} />
    </Card>
  );
}

export function ManualPanel() {
  const tool = useStudio((s) => s.tool);
  const brush = useStudio((s) => s.brush);
  const set = useStudio((s) => s.set);
  const mode = useStudio((s) => s.settings.mode);
  const view = useStudio((s) => s.view);
  const setView = useStudio((s) => s.setView);
  const [refine, setRefine] = useRefine();
  return (
    <Card title="Manual editing" icon={<Brush size={15} />}>
      <Segmented
        value={tool === 'erase' || tool === 'restore' ? tool : ('none' as never)}
        onChange={(t) => set({ tool: t })}
        options={[
          { value: 'erase', label: <><Eraser size={13} /> Eraser</>, title: 'Eraser (E)' },
          { value: 'restore', label: <><Brush size={13} /> Restore</>, title: 'Restore / protect (R)' },
        ]}
      />
      <Slider label="Brush size" min={1} max={400} value={brush.size} suffix=" px" onChange={(v) => set({ brush: { ...brush, size: v } })} hint="In image pixels. Size 1 edits exactly one pixel. Shortcut: [ and ]" />
      <Slider label="Brush hardness" min={0} max={100} value={brush.hardness} disabled={mode === 'pixel'} onChange={(v) => set({ brush: { ...brush, hardness: v } })} hint={mode === 'pixel' ? 'Pixel Art mode always uses a hard brush.' : 'Soft brushes create gradual transparency.'} />
      <Note>
        <b className="text-fg">Restore</b> brings back the original pixels and protects them: in color-key and pixel modes it also blocks the automatic removal from reaching those areas.
      </Note>
      <div className="grid grid-cols-2 gap-1.5">
        <Button onClick={() => setRefine({ invert: !refine.invert })} active={refine.invert}><FlipHorizontal2 size={14} /> Invert</Button>
        <Button onClick={() => setView({ mode: view.mode === 'mask' ? 'result' : 'mask' })} active={view.mode === 'mask'}><Layers size={14} /> Mask view</Button>
        <Button onClick={() => engine.fillLayer('restore')}>Restore all</Button>
        <Button onClick={() => engine.fillLayer('erase')}>Erase all</Button>
      </div>
      <Toggle label="Mask overlay" checked={view.overlay} onChange={(v) => setView({ overlay: v })} hint="Tints removed areas red on top of the original." />
      <Slider label="Overlay opacity" min={10} max={100} value={view.overlayOpacity} disabled={!view.overlay} onChange={(v) => setView({ overlayOpacity: v })} />
      <Button variant="danger" className="w-full" onClick={() => engine.resetEdits()}><RotateCcw size={14} /> Reset manual edits</Button>
    </Card>
  );
}

export function RefinePanel() {
  const [refine, setRefine] = useRefine();
  const mode = useStudio((s) => s.settings.mode);
  const pixel = mode === 'pixel';
  const chromaKey = useStudio((s) => s.settings.chroma.key);
  const setSettings = useStudio((s) => s.setSettings);
  return (
    <Card title="Edge refinement" icon={<Wand2 size={15} />}>
      {pixel && <Note>Pixel Art mode keeps edges hard: alpha levels and feathering are disabled to avoid halos.</Note>}
      <Slider label="Alpha threshold (cut below)" min={0} max={254} value={refine.alphaLow} disabled={pixel} onChange={(v) => setRefine({ alphaLow: Math.min(v, refine.alphaHigh - 1) })} hint="Faint pixels below this alpha become fully transparent — removes haze and residue." />
      <Slider label="Solid above" min={1} max={255} value={refine.alphaHigh} disabled={pixel} onChange={(v) => setRefine({ alphaHigh: Math.max(v, refine.alphaLow + 1) })} hint="Pixels above this alpha become fully opaque so their original RGB is kept exactly." />
      <Slider label="Shrink / expand edge" min={-20} max={20} value={refine.shift} suffix=" px" onChange={(v) => setRefine({ shift: v })} hint="Negative erodes the edge (removes fringes), positive expands it." />
      <Slider label="Feather" min={0} max={20} step={0.5} value={refine.feather} disabled={pixel} onChange={(v) => setRefine({ feather: v })} hint="Softens the cut-out edge." />
      <Slider label="Residue cleanup" min={0} max={5000} step={8} value={refine.residueSize} suffix=" px" onChange={(v) => setRefine({ residueSize: v })} hint="Deletes isolated leftover specks smaller than this many pixels." />
      <Slider label="Fill small holes" min={0} max={5000} step={8} value={refine.holeSize} suffix=" px" onChange={(v) => setRefine({ holeSize: v })} hint="Fills transparent holes inside the subject smaller than this many pixels." />
      <Toggle label="Remove background contamination" checked={refine.decontaminate} onChange={(v) => setRefine({ decontaminate: v })} hint="Un-mixes the background color from semi-transparent edge pixels so no green/white halo remains. Fully opaque pixels are untouched." />
      <div className="space-y-2.5 rounded-xl border border-line p-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          Color spill suppression <Hint text="Removes the reflected screen color from edges. Uses the key color from Color key mode." />
          <input type="color" className="ml-auto h-6 w-8" value={rgbToHex(chromaKey)} onChange={(e) => setSettings((s) => ({ ...s, chroma: { ...s.chroma, key: hexToRgb(e.target.value) } }))} aria-label="Spill color" />
        </div>
        <Slider label="Amount" min={0} max={100} value={refine.spill} onChange={(v) => setRefine({ spill: v })} />
        <Segmented size="sm" value={refine.spillScope} onChange={(v) => setRefine({ spillScope: v })} options={[{ value: 'edges', label: 'Edges only' }, { value: 'all', label: 'Whole subject' }]} />
      </div>
      <Toggle label="Invert selection" checked={refine.invert} onChange={(v) => setRefine({ invert: v })} />
    </Card>
  );
}

export function ExportPanel({ compact = false }: { compact?: boolean }) {
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
    <Card title="Export" icon={<Download size={15} />}>
      {!compact && (
        <div>
          <div className="mb-1.5 text-xs text-muted">Presets</div>
          <Segmented size="sm" value={e.preset} onChange={applyPreset} options={[{ value: 'sprite', label: 'Game sprite' }, { value: 'illustration', label: 'Illustration' }, { value: 'photo', label: 'Photo' }]} />
        </div>
      )}
      <div>
        <div className="mb-1.5 text-xs text-muted">Format</div>
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
          {e.format === 'png' && 'Lossless 8-bit RGBA with real alpha. Pixel values are written exactly — no canvas re-encoding.'}
          {e.format === 'webp' && 'Supports transparency. Smaller files; quality 100 is near-lossless (browser dependent).'}
          {e.format === 'jpeg' && 'JPG cannot store transparency — removed areas are filled with the background color below.'}
          {e.format === 'tiff' && 'Uncompressed lossless TIFF with unassociated alpha (opens in Photoshop, GIMP, Affinity).'}
        </p>
      </div>
      {(e.format === 'webp' || e.format === 'jpeg') && (
        <Slider label="Quality" min={50} max={100} value={Math.round(e.quality * 100)} onChange={(v) => setExport({ quality: v / 100 })} />
      )}
      {e.format === 'png' && !compact && (
        <Segmented size="sm" value={e.pngFilter} onChange={(v) => setExport({ pngFilter: v })} options={[{ value: 'adaptive', label: 'Smallest file' }, { value: 'none', label: 'Fastest encode' }]} />
      )}
      <div>
        <div className="mb-1.5 text-xs text-muted">Background</div>
        <Segmented
          value={e.background}
          onChange={(v) => { if (v === 'image' && !bgImage) bgRef.current?.click(); else setExport({ background: v, bgForced: false }); }}
          options={[
            ...(e.format === 'jpeg' ? [] : [{ value: 'transparent' as const, label: 'Transparent' }]),
            { value: 'color' as const, label: 'Color' },
            { value: 'image' as const, label: 'Image' },
          ]}
        />
        {(e.background === 'color' || (e.format === 'jpeg' && e.background === 'transparent')) && (
          <div className="mt-2 flex items-center gap-2">
            <input type="color" value={e.bgColor} onChange={(ev) => setExport({ bgColor: ev.target.value })} className="h-8 w-10" aria-label="Background color" />
            {['#ffffff', '#000000', '#f3f4f6', '#1f2937'].map((c) => <Swatch key={c} color={c} selected={e.bgColor === c} onClick={() => setExport({ bgColor: c })} title={c} />)}
            <PickButton target="export-bg" label="" />
          </div>
        )}
        {e.background === 'image' && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
            {bgImage ? <span className="flex-1 truncate">{bgImage.name}</span> : <span className="flex-1">No image</span>}
            <Button onClick={() => bgRef.current?.click()}>Choose</Button>
            {bgImage && <Button variant="ghost" onClick={() => void engine.setBackgroundImage(null)}><X size={13} /></Button>}
          </div>
        )}
        <input ref={bgRef} type="file" accept="image/*" hidden onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void engine.setBackgroundImage(f); ev.target.value = ''; }} />
      </div>
      <div>
        <div className="mb-1.5 text-xs text-muted">Size</div>
        <Segmented size="sm" value={e.sizeMode} onChange={(v) => setExport({ sizeMode: v, width: e.width || W, height: e.height || H })} options={[{ value: 'original', label: 'Original' }, { value: 'scale', label: 'Scale' }, { value: 'custom', label: 'Custom' }]} />
        {e.sizeMode === 'scale' && (
          <div className="mt-2 grid grid-cols-5 gap-1">
            {[0.25, 0.5, 2, 4, 8].map((s) => (
              <Button key={s} active={e.scale === s} onClick={() => setExport({ scale: s })} className="!px-1">{s}×</Button>
            ))}
          </div>
        )}
        {e.sizeMode === 'custom' && (
          <div className="mt-2 flex items-center gap-1.5">
            <input type="number" min={1} max={16384} value={e.width} aria-label="Width" onChange={(ev) => { const v = Number(ev.target.value); setExport({ width: v, height: e.lockRatio && W ? Math.round((v * H) / W) : e.height }); }} className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-xs outline-none focus:border-accent" />
            <button type="button" className={cx('rounded-md px-1 text-xs', e.lockRatio ? 'text-accent' : 'text-faint')} onClick={() => setExport({ lockRatio: !e.lockRatio })} title="Lock aspect ratio">🔗</button>
            <input type="number" min={1} max={16384} value={e.height} aria-label="Height" onChange={(ev) => { const v = Number(ev.target.value); setExport({ height: v, width: e.lockRatio && H ? Math.round((v * W) / H) : e.width }); }} className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-xs outline-none focus:border-accent" />
          </div>
        )}
        {e.sizeMode !== 'original' && (
          <div className="mt-2">
            <Segmented size="sm" value={e.resample} onChange={(v) => setExport({ resample: v })} options={[{ value: 'nearest', label: 'Nearest (pixel art)' }, { value: 'smooth', label: 'Smooth' }]} />
          </div>
        )}
        {doc && <p className="mt-1.5 font-mono text-[11px] text-faint">Output: {outW} × {outH} px {e.sizeMode === 'original' && '· original resolution'}</p>}
      </div>
      <div>
        <div className="mb-1.5 text-xs text-muted">Filename</div>
        <div className="flex items-center rounded-lg border border-line bg-panel pr-2 focus-within:border-accent">
          <input value={e.filename} onChange={(ev) => setExport({ filename: ev.target.value })} className="w-full bg-transparent px-2 py-1.5 text-xs outline-none" aria-label="Filename" />
          <span className="text-[11px] text-faint">.{e.format === 'jpeg' ? 'jpg' : e.format === 'tiff' ? 'tif' : e.format}</span>
        </div>
      </div>
      <Button variant="primary" className="w-full !py-3 text-sm font-semibold tracking-wide" disabled={!doc || exporting} onClick={() => void engine.download()}>
        <Download size={16} /> {exporting ? 'ENCODING…' : 'DOWNLOAD IMAGE'}
      </Button>
    </Card>
  );
}
