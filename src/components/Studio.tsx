'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Upload, Sparkles, Pipette, Grid3x3, Brush, Wand2, Download, Undo2, Redo2, RotateCcw, Sun, Moon, HelpCircle, Hand, Eraser, ZoomIn, ZoomOut,
  Maximize, Scan, Languages, SplitSquareHorizontal, Columns2, Image as ImageIcon, Layers, Eye, Search, X, Loader2, CheckCircle2, AlertCircle, Info, ImagePlus, SlidersHorizontal, ShieldCheck,
} from 'lucide-react';
import { useStudio, type Section } from '@/store/studio';
import { useT, LANGUAGES, isLang, type Key } from '@/i18n';
import { engine } from '@/lib/engine';
import { ACCEPT_ATTR, formatBytes } from '@/lib/decode';
import Viewport, { viewportApi } from './Viewport';
import { AiPanel, ChromaPanel, ExportPanel, ManualPanel, PixelPanel, RefinePanel, UploadPanel } from './panels';
import { Button, Segmented, cx } from './ui';
import BatchDialog from './BatchDialog';
import HelpDialog from './HelpDialog';

const SECTIONS: { id: Section; label: Key; icon: React.ReactNode }[] = [
  { id: 'upload', label: 'section.upload', icon: <Upload size={18} /> },
  { id: 'ai', label: 'section.ai', icon: <Sparkles size={18} /> },
  { id: 'chroma', label: 'section.chroma', icon: <Pipette size={18} /> },
  { id: 'pixel', label: 'section.pixel', icon: <Grid3x3 size={18} /> },
  { id: 'manual', label: 'section.manual', icon: <Brush size={18} /> },
  { id: 'refine', label: 'section.refine', icon: <Wand2 size={18} /> },
  { id: 'export', label: 'section.export', icon: <Download size={18} /> },
];

function Logo() {
  const t = useT();
  return (
    <div className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--accent-strong)" />
        <path d="M9 9h6v6H9zM17 17h6v6h-6z" fill="#fff" />
        <path d="M17 9h6v6h-6zM9 17h6v6H9z" fill="#fff" opacity=".35" />
      </svg>
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-tight">PixelCut <span className="text-accent">Studio</span></div>
        <div className="hidden text-[10px] text-faint sm:block">{t('app.tagline')}</div>
      </div>
    </div>
  );
}

function TopNav() {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const page = useStudio((s) => s.page);
  const theme = useStudio((s) => s.theme);
  const set = useStudio((s) => s.set);
  const doc = useStudio((s) => s.doc);
  const go = (p: 'remover' | 'editor') => {
    const st = useStudio.getState();
    if (p === 'editor') set({ page: p, section: 'manual', tool: st.tool === 'restore' ? 'restore' : 'erase' });
    else set({ page: p, section: doc ? st.settings.mode : 'upload', tool: 'pan' });
  };
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-panel px-3 sm:px-4">
      <Logo />
      <nav className="ml-2 flex items-center gap-0.5 sm:ml-6" aria-label="Main">
        {([['remover', t('nav.remover'), t('nav.removerShort')], ['editor', t('nav.editor'), t('nav.editorShort')]] as const).map(([id, label, short]) => (
          <button key={id} type="button" onClick={() => go(id)} className={cx('rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3', page === id ? 'bg-raised text-fg' : 'text-muted hover:text-fg')}>
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
        <button type="button" onClick={() => set({ helpOpen: true })} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted hover:text-fg sm:px-3">{t('nav.help')}</button>
      </nav>
      <div className="ml-auto flex items-center gap-1.5">
        <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] text-muted md:flex">
          <ShieldCheck size={12} className="text-success" /> {t('nav.privacy')}
        </span>
        <label className="relative flex items-center gap-1.5 rounded-xl border border-line bg-panel px-2 py-1.5 text-xs text-muted hover:border-line-strong" title={t('nav.language')}>
          <Languages size={14} className="shrink-0" />
          <select
            aria-label={t('nav.language')}
            value={lang}
            onChange={(e) => { if (isLang(e.target.value)) set({ lang: e.target.value }); }}
            className="cursor-pointer appearance-none bg-transparent pr-1 text-xs font-medium text-fg outline-none"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} className="bg-panel text-fg">{l.label}</option>
            ))}
          </select>
        </label>
        <Button variant="ghost" title={theme === 'dark' ? t('nav.themeLight') : t('nav.themeDark')} onClick={() => set({ theme: theme === 'dark' ? 'light' : 'dark' })}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </Button>
      </div>
    </header>
  );
}

function LeftSidebar() {
  const t = useT();
  const section = useStudio((s) => s.section);
  const mode = useStudio((s) => s.settings.mode);
  const doc = useStudio((s) => s.doc);
  const set = useStudio((s) => s.set);
  const setMode = useStudio((s) => s.setMode);
  const open = (id: Section) => {
    const st = useStudio.getState();
    if ((id === 'ai' || id === 'chroma' || id === 'pixel') && doc) setMode(id);
    set({
      section: id,
      page: id === 'manual' ? 'editor' : 'remover',
      tool: id === 'manual' ? (st.tool === 'restore' ? 'restore' : 'erase') : st.tool === 'erase' || st.tool === 'restore' ? 'pan' : st.tool,
      mobilePanel: true,
    });
  };
  return (
    <aside className="order-3 flex shrink-0 gap-1 overflow-x-auto border-t border-line bg-panel px-2 py-1.5 lg:order-none lg:w-[84px] lg:flex-col lg:overflow-visible lg:border-t-0 lg:border-r lg:px-2 lg:py-3">
      {SECTIONS.map((s) => {
        const isMode = s.id === 'ai' || s.id === 'chroma' || s.id === 'pixel';
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => open(s.id)}
            className={cx(
              'relative flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-[10px] font-medium transition-colors',
              section === s.id ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-raised hover:text-fg',
            )}
          >
            {s.icon}
            <span className="whitespace-nowrap">{t(s.label)}</span>
            {isMode && doc && mode === s.id && <span className="absolute top-1.5 right-2 h-1.5 w-1.5 rounded-full bg-success" title={t('sidebar.active')} />}
          </button>
        );
      })}
    </aside>
  );
}

function ViewToolbar() {
  const t = useT();
  const view = useStudio((s) => s.view);
  const setView = useStudio((s) => s.setView);
  const tool = useStudio((s) => s.tool);
  const set = useStudio((s) => s.set);
  const bgImage = useStudio((s) => s.bgImage);
  const doc = useStudio((s) => s.doc);
  const [customOpen, setCustomOpen] = useState(false);
  if (!doc) return null;
  const tools = [
    { id: 'pan', icon: <Hand size={15} />, title: t('tool.pan') },
    { id: 'eyedropper', icon: <Pipette size={15} />, title: t('tool.eyedropper') },
    { id: 'erase', icon: <Eraser size={15} />, title: t('tool.erase') },
    { id: 'restore', icon: <Brush size={15} />, title: t('tool.restore') },
  ] as const;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel/80 px-2 py-1.5 backdrop-blur sm:px-3">
      <div className="flex items-center rounded-xl border border-line bg-panel p-0.5">
        {tools.map((tl) => (
          <button key={tl.id} type="button" title={tl.title} aria-label={tl.title} onClick={() => set({ tool: tl.id, ...(tl.id === 'eyedropper' ? { eyedropTarget: useStudio.getState().settings.mode === 'pixel' ? 'pixel' : 'chroma' } : {}) })}
            className={cx('grid h-7 w-8 place-items-center rounded-[10px] transition-colors', tool === tl.id ? (tl.id === 'erase' ? 'bg-rose-500/15 text-rose-400' : tl.id === 'restore' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-accent-soft text-accent') : 'text-muted hover:text-fg')}>
            {tl.icon}
          </button>
        ))}
      </div>
      <div className="shrink-0">
        <Segmented size="sm" value={view.mode} onChange={(m) => setView({ mode: m })} options={[
          { value: 'result', label: <><Eye size={12} /> <span className="hidden sm:inline">{t('view.result')}</span></>, title: t('view.result') },
          { value: 'split', label: <><SplitSquareHorizontal size={12} /> <span className="hidden sm:inline">{t('view.split')}</span></>, title: t('view.splitTitle') },
          { value: 'side', label: <><Columns2 size={12} /> <span className="hidden sm:inline">{t('view.side')}</span></>, title: t('view.sideTitle') },
          { value: 'original', label: <><ImageIcon size={12} /> <span className="hidden sm:inline">{t('view.original')}</span></>, title: t('view.original') },
          { value: 'mask', label: <><Layers size={12} /> <span className="hidden sm:inline">{t('view.mask')}</span></>, title: t('view.maskTitle') },
        ]} />
      </div>
      <div className="relative flex items-center gap-1 rounded-xl border border-line bg-panel p-1" role="group" aria-label={t('view.previewBg')}>
        <button type="button" title={t('bg.checker')} aria-label={t('bg.checker')} onClick={() => setView({ bg: 'checker' })} className={cx('checker h-5 w-5 rounded-md border', view.bg === 'checker' ? 'border-accent ring-2 ring-accent/40' : 'border-line-strong')} />
        <button type="button" title={t('bg.black')} aria-label={t('bg.black')} onClick={() => setView({ bg: 'black' })} className={cx('h-5 w-5 rounded-md border bg-black', view.bg === 'black' ? 'border-accent ring-2 ring-accent/40' : 'border-line-strong')} />
        <button type="button" title={t('bg.white')} aria-label={t('bg.white')} onClick={() => setView({ bg: 'white' })} className={cx('h-5 w-5 rounded-md border bg-white', view.bg === 'white' ? 'border-accent ring-2 ring-accent/40' : 'border-line-strong')} />
        <button type="button" title={t('bg.custom')} aria-label={t('bg.custom')} onClick={() => { setView({ bg: 'custom' }); setCustomOpen((o) => !o); }} className={cx('h-5 w-5 rounded-md border', view.bg === 'custom' ? 'border-accent ring-2 ring-accent/40' : 'border-line-strong')} style={{ background: view.custom }} />
        {bgImage && (
          <button type="button" title={t('bg.image')} aria-label={t('bg.image')} onClick={() => setView({ bg: 'image' })} className={cx('h-5 w-5 rounded-md border bg-cover', view.bg === 'image' ? 'border-accent ring-2 ring-accent/40' : 'border-line-strong')} style={{ backgroundImage: `url(${bgImage.url})` }} />
        )}
        {customOpen && view.bg === 'custom' && (
          <div className="absolute top-full left-0 z-30 mt-1 flex items-center gap-2 rounded-xl border border-line bg-raised p-2 shadow-xl">
            <input type="color" value={view.custom} onChange={(e) => setView({ custom: e.target.value })} className="h-7 w-9" aria-label={t('bg.custom')} />
            <button type="button" className="text-[11px] text-muted hover:text-fg" onClick={() => { set({ tool: 'eyedropper', eyedropTarget: 'preview-bg' }); setCustomOpen(false); }}>{t('common.pick')}</button>
            <button type="button" aria-label={t('common.close')} onClick={() => setCustomOpen(false)} className="text-muted"><X size={13} /></button>
          </div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-0.5">
        <Button variant="ghost" title={t('zoom.inspector')} active={view.loupe} onClick={() => setView({ loupe: !view.loupe })}><Search size={15} /></Button>
        <Button variant="ghost" title={t('zoom.out')} onClick={() => viewportApi.zoomBy(1 / 1.25)}><ZoomOut size={15} /></Button>
        <span className="w-12 text-center font-mono text-[11px] text-muted tabular-nums">{Math.round(view.zoom * 100)}%</span>
        <Button variant="ghost" title={t('zoom.in')} onClick={() => viewportApi.zoomBy(1.25)}><ZoomIn size={15} /></Button>
        <Button variant="ghost" title={t('zoom.fit')} onClick={() => viewportApi.fit()}><Maximize size={15} /></Button>
        <Button variant="ghost" title={t('zoom.actual')} onClick={() => viewportApi.actual()} className="font-mono !text-[11px]">1:1</Button>
      </div>
    </div>
  );
}

function EmptyState() {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const loading = useStudio((s) => s.loading);
  return (
    <div className="flex h-full items-center justify-center overflow-auto p-6">
      <div className="w-full max-w-xl text-center">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="group flex w-full flex-col items-center gap-4 rounded-3xl border border-dashed border-line-strong bg-panel/60 px-6 py-14 transition-colors hover:border-accent hover:bg-accent-soft"
        >
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent transition-transform group-hover:scale-105">
            {loading.active ? <Loader2 size={26} className="animate-spin" /> : <ImagePlus size={26} />}
          </span>
          <span>
            <span className="block text-base font-semibold">{loading.active ? loading.stage : t('empty.title')}</span>
            <span className="mt-1 block text-sm text-muted">{t('empty.sub')}</span>
          </span>
          <span className="text-xs text-faint">{t('empty.formats')}</span>
        </button>
        <input ref={input} type="file" accept={ACCEPT_ATTR} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void engine.loadFile(f); e.target.value = ''; }} />
        <div className="mt-8 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
          {[
            { icon: <Sparkles size={16} />, t: t('feature.ai.t'), d: t('feature.ai.d') },
            { icon: <Pipette size={16} />, t: t('feature.chroma.t'), d: t('feature.chroma.d') },
            { icon: <Grid3x3 size={16} />, t: t('feature.pixel.t'), d: t('feature.pixel.d') },
          ].map((f) => (
            <div key={f.t} className="rounded-2xl border border-line bg-panel/60 p-4">
              <div className="mb-2 text-accent">{f.icon}</div>
              <div className="text-xs font-semibold">{f.t}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-muted">{f.d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RightPanel() {
  const t = useT();
  const section = useStudio((s) => s.section);
  const doc = useStudio((s) => s.doc);
  const mobilePanel = useStudio((s) => s.mobilePanel);
  const set = useStudio((s) => s.set);
  const panel = (() => {
    switch (section) {
      case 'upload': return <UploadPanel />;
      case 'ai': return <AiPanel />;
      case 'chroma': return <ChromaPanel />;
      case 'pixel': return <PixelPanel />;
      case 'manual': return <ManualPanel />;
      case 'refine': return <RefinePanel />;
      case 'export': return <ExportPanel />;
    }
  })();
  return (
    <aside
      className={cx(
        'order-2 flex shrink-0 flex-col overflow-hidden border-line bg-panel lg:order-none lg:w-[330px] lg:border-l',
        mobilePanel ? 'max-h-[45dvh] border-t lg:max-h-none' : 'max-h-0 lg:max-h-none',
      )}
    >
      <div className="flex items-center justify-between px-4 pt-2 lg:hidden">
        <span className="text-[11px] text-faint">{t('common.controls')}</span>
        <button type="button" onClick={() => set({ mobilePanel: false })} className="text-muted" aria-label={t('common.hideControls')}><X size={14} /></button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {panel}
        {doc && section !== 'export' && section !== 'refine' && section !== 'upload' && <RefineSummary />}
        {doc && section !== 'export' && <ExportPanel compact />}
      </div>
    </aside>
  );
}

/** Compact alpha/edge controls that stay visible below the active tool panel. */
function RefineSummary() {
  const t = useT();
  const refine = useStudio((s) => s.settings.refine);
  const mode = useStudio((s) => s.settings.mode);
  const set = useStudio((s) => s.set);
  return (
    <button type="button" onClick={() => set({ section: 'refine' })} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-panel-2/60 px-4 py-3 text-left hover:border-line-strong">
      <SlidersHorizontal size={15} className="text-accent" />
      <div className="flex-1 text-[11px] text-muted">
        <div className="text-[13px] font-semibold text-fg">{t('summary.title')}</div>
        {mode === 'pixel' ? t('summary.hard') : t('summary.alpha', { lo: refine.alphaLow, hi: refine.alphaHigh })} · {t('summary.shift', { n: refine.shift })}{mode !== 'pixel' && ` · ${t('summary.feather', { n: refine.feather })}`} · {refine.decontaminate ? t('summary.decont') : t('summary.raw')}
      </div>
    </button>
  );
}

function BottomBar() {
  const t = useT();
  const doc = useStudio((s) => s.doc);
  const history = useStudio((s) => s.history);
  const processing = useStudio((s) => s.processing);
  const ai = useStudio((s) => s.ai);
  const exporting = useStudio((s) => s.exporting);
  const e = useStudio((s) => s.exportOpts);
  const mode = useStudio((s) => s.settings.mode);
  const outW = !doc ? 0 : e.sizeMode === 'original' ? doc.width : e.sizeMode === 'scale' ? Math.round(doc.width * e.scale) : e.width;
  const outH = !doc ? 0 : e.sizeMode === 'original' ? doc.height : e.sizeMode === 'scale' ? Math.round(doc.height * e.scale) : e.height;
  const busy = processing.active || ai.status === 'loading' || ai.status === 'running';
  return (
    <footer className="order-4 flex shrink-0 items-center gap-2 border-t border-line bg-panel px-2 py-2 sm:gap-3 sm:px-4">
      {doc ? (
        <div className="hidden min-w-0 items-center gap-3 text-[11px] text-muted md:flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={doc.thumb} alt="" className="checker h-8 w-8 rounded-md object-contain" />
          <div className="min-w-0 leading-4">
            <div className="max-w-[220px] truncate font-medium text-fg" title={doc.name}>{doc.name}</div>
            <div className="font-mono">
              {t('bottom.info', { w: doc.width, h: doc.height, size: formatBytes(doc.size), ow: outW, oh: outH, fmt: e.format.toUpperCase() })}
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden text-[11px] text-faint md:block">{t('bottom.none')}</div>
      )}
      <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
        {busy ? (
          <><Loader2 size={13} className="shrink-0 animate-spin text-accent" /><span className="truncate">{ai.status === 'loading' || ai.status === 'running' ? ai.stage || t('mode.ai') : processing.stage}</span></>
        ) : doc && processing.ms !== null ? (
          <><CheckCircle2 size={13} className="shrink-0 text-success" /><span className="hidden truncate sm:inline">{t(`mode.${mode}` as Key)} · {processing.ms} ms</span></>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" title={t('bottom.undo')} disabled={!history.canUndo} onClick={() => engine.undo()}><Undo2 size={16} /></Button>
        <Button variant="ghost" title={t('bottom.redo')} disabled={!history.canRedo} onClick={() => engine.redoAction()}><Redo2 size={16} /></Button>
        <Button variant="ghost" title={t('bottom.resetTitle')} disabled={!doc} onClick={() => engine.resetAll()}><RotateCcw size={16} /><span className="hidden sm:inline">{t('bottom.reset')}</span></Button>
        <Button variant="primary" className="ml-1 !px-4 !py-2.5 font-semibold tracking-wide" disabled={!doc || exporting || !!(processing.active && !engine.processed)} onClick={() => void engine.download()}>
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} {t('common.download')}
        </Button>
      </div>
    </footer>
  );
}

function Toasts() {
  const t = useT();
  const toasts = useStudio((s) => s.toasts);
  const dismiss = useStudio((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-50 flex w-[min(380px,calc(100vw-24px))] -translate-x-1/2 flex-col gap-2" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className="animate-fade-in pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line bg-raised px-3 py-2.5 text-xs shadow-2xl">
          {x.kind === 'error' ? <AlertCircle size={15} className="mt-px shrink-0 text-danger" /> : x.kind === 'success' ? <CheckCircle2 size={15} className="mt-px shrink-0 text-success" /> : <Info size={15} className="mt-px shrink-0 text-accent" />}
          <span className="flex-1 leading-relaxed">{x.text}</span>
          <button type="button" aria-label={t('common.dismiss')} onClick={() => dismiss(x.id)} className="text-faint hover:text-fg"><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}

function ProcessingOverlay() {
  const t = useT();
  const ai = useStudio((s) => s.ai);
  const loading = useStudio((s) => s.loading);
  const mode = useStudio((s) => s.settings.mode);
  const show = loading.active || (mode === 'ai' && (ai.status === 'loading' || ai.status === 'running') && !engine.processed);
  if (!show) return null;
  const pct = ai.progress !== null && ai.progress < 1 ? Math.round(ai.progress * 100) : null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/30 backdrop-blur-[2px]">
      <div className="w-72 rounded-2xl border border-line bg-panel p-5 text-center shadow-2xl">
        <Loader2 size={22} className="mx-auto animate-spin text-accent" />
        <div className="mt-3 text-sm font-medium">{loading.active ? loading.stage : ai.stage || t('overlay.preparing')}</div>
        {pct !== null && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} /></div>
        )}
        <div className="mt-2 text-[11px] text-muted">{t('overlay.local')}</div>
      </div>
    </div>
  );
}

export default function Studio() {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const doc = useStudio((s) => s.doc);
  const theme = useStudio((s) => s.theme);
  const helpOpen = useStudio((s) => s.helpOpen);
  const batchOpen = useStudio((s) => s.batchOpen);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => engine.init(), []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('pixelcut-theme', theme); } catch { /* ignore */ }
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem('pixelcut-lang', lang); } catch { /* ignore */ }
  }, [lang]);

  // paste from clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            void engine.loadFile(new File([f], f.name && f.name !== 'image.png' ? f.name : `pasted-${Date.now()}.png`, { type: f.type }));
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      const st = useStudio.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) engine.redoAction(); else engine.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); engine.redoAction(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void engine.download(); return; }
      if (mod) return;
      switch (e.key) {
        case 'e': case 'E': st.set({ tool: 'erase' }); break;
        case 'r': case 'R': st.set({ tool: 'restore' }); break;
        case 'h': case 'H': st.set({ tool: 'pan' }); break;
        case 'i': case 'I': st.set({ tool: 'eyedropper', eyedropTarget: st.settings.mode === 'pixel' ? 'pixel' : 'chroma' }); break;
        case '[': st.set({ brush: { ...st.brush, size: Math.max(1, Math.round(st.brush.size / 1.2)) } }); break;
        case ']': st.set({ brush: { ...st.brush, size: Math.min(400, Math.round(st.brush.size * 1.2) + 1) } }); break;
        case '0': viewportApi.fit(); break;
        case '1': viewportApi.actual(); break;
        case '+': case '=': viewportApi.zoomBy(1.25); break;
        case '-': viewportApi.zoomBy(0.8); break;
        case 'm': case 'M': st.setView({ mode: st.view.mode === 'mask' ? 'result' : 'mask' }); break;
        case 'b': case 'B': st.setView({ mode: st.view.mode === 'split' ? 'result' : 'split' }); break;
        case 'Escape': st.set({ tool: 'pan', helpOpen: false }); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = [...e.dataTransfer.files];
    if (files.length > 1) {
      useStudio.getState().set({ batchOpen: true });
      window.dispatchEvent(new CustomEvent('pixelcut-batch-files', { detail: files }));
      return;
    }
    if (files[0]) void engine.loadFile(files[0]);
  };

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden"
      onDragEnter={(e) => { if (e.dataTransfer.types.includes('Files')) { dragDepth.current++; setDragging(true); } }}
      onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <TopNav />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <LeftSidebar />
        <main className="order-1 flex min-h-[42dvh] min-w-0 flex-1 flex-col lg:order-none">
          <ViewToolbar />
          <div className="relative min-h-0 flex-1">
            {doc ? <Viewport /> : <EmptyState />}
            {doc && <ProcessingOverlay />}
            {doc && <MobilePanelToggle />}
          </div>
        </main>
        <RightPanel />
      </div>
      <BottomBar />
      <Toasts />
      {helpOpen && <HelpDialog />}
      {batchOpen && <BatchDialog />}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-[var(--bg)]/80 backdrop-blur-sm">
          <div className="rounded-3xl border-2 border-dashed border-accent px-10 py-8 text-center">
            <ImagePlus size={30} className="mx-auto text-accent" />
            <div className="mt-3 text-sm font-semibold">{t('drop.title')}</div>
            <div className="mt-1 text-xs text-muted">{t('drop.sub')}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function MobilePanelToggle() {
  const t = useT();
  const mobilePanel = useStudio((s) => s.mobilePanel);
  const set = useStudio((s) => s.set);
  if (mobilePanel) return null;
  return (
    <button type="button" onClick={() => set({ mobilePanel: true })} className="absolute right-3 bottom-3 z-10 flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-2 text-xs shadow-xl lg:hidden">
      <Scan size={14} /> {t('common.controls')}
    </button>
  );
}
