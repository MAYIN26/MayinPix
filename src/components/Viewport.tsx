'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStudio } from '@/store/studio';
import { engine } from '@/lib/engine';
import { translate, useT } from '@/i18n';

/** Imperative API used by the toolbar (fit / 100% / zoom). */
export const viewportApi: { fit: () => void; actual: () => void; zoomBy: (f: number) => void } = {
  fit: () => {},
  actual: () => {},
  zoomBy: () => {},
};

type Xf = { scale: number; tx: number; ty: number };
type Drag =
  | { kind: 'pan'; x: number; y: number; tx: number; ty: number }
  | { kind: 'split' }
  | { kind: 'brush' }
  | { kind: 'pinch'; dist: number; cx: number; cy: number; scale: number; tx: number; ty: number }
  | null;

const MIN_SCALE = 0.02;
const MAX_SCALE = 64;

function makeChecker(dark: boolean) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  g.fillStyle = dark ? '#2b2e35' : '#ffffff';
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = dark ? '#3a3e47' : '#d9dbe0';
  g.fillRect(0, 0, 8, 8);
  g.fillRect(8, 8, 8, 8);
  return c;
}

export default function Viewport() {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const xf = useRef<Xf>({ scale: 1, tx: 0, ty: 0 });
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const drag = useRef<Drag>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const hover = useRef<{ sx: number; sy: number; ix: number; iy: number; inside: boolean } | null>(null);
  const space = useRef(false);
  const raf = useRef(0);
  const tint = useRef<HTMLCanvasElement | null>(null);
  const checker = useRef<{ dark: HTMLCanvasElement; light: HTMLCanvasElement } | null>(null);
  const [readout, setReadout] = useState<ReturnType<typeof engine.pixelAt> & { sx: number; sy: number } | null>(null);
  const [cursor, setCursor] = useState('default');

  const doc = useStudio((s) => s.doc);
  const tick = useStudio((s) => s.tick);
  const view = useStudio((s) => s.view);
  const tool = useStudio((s) => s.tool);
  const brush = useStudio((s) => s.brush);
  const mode = useStudio((s) => s.settings.mode);
  const theme = useStudio((s) => s.theme);
  const bgImage = useStudio((s) => s.bgImage);

  const paneCount = view.mode === 'side' ? 2 : 1;

  /** Screen → image coordinates (handles side-by-side panes). */
  const toImage = useCallback((sx: number, sy: number) => {
    const { w } = size.current;
    const paneW = paneCount === 2 ? w / 2 : w;
    const lx = paneCount === 2 && sx >= paneW ? sx - paneW : sx;
    const { scale, tx, ty } = xf.current;
    return { x: (lx - tx) / scale, y: (sy - ty) / scale };
  }, [paneCount]);

  const render = useCallback(() => {
    raf.current = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const { w, h, dpr } = size.current;
    const st = useStudio.getState();
    const v = st.view;
    const BEFORE = translate(st.lang, 'canvas.before'), AFTER = translate(st.lang, 'canvas.after');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!engine.resultCanvas || !engine.originalCanvas || !st.doc) return;
    if (!checker.current) checker.current = { dark: makeChecker(true), light: makeChecker(false) };
    const IW = engine.w, IH = engine.h;
    const { scale, tx, ty } = xf.current;
    const pixel = st.settings.mode === 'pixel';
    const smooth = !pixel && scale < 3;
    const panes = v.mode === 'side' ? 2 : 1;
    const paneW = w / panes;
    const mask = v.mode === 'mask' || v.overlay ? engine.getMaskCanvas() : null;

    const drawBg = (x: number, y: number, iw: number, ih: number) => {
      switch (v.bg) {
        case 'black': ctx.fillStyle = '#000'; ctx.fillRect(x, y, iw, ih); break;
        case 'white': ctx.fillStyle = '#fff'; ctx.fillRect(x, y, iw, ih); break;
        case 'custom': ctx.fillStyle = v.custom; ctx.fillRect(x, y, iw, ih); break;
        case 'image':
          if (engine.bgBitmap) {
            const b = engine.bgBitmap;
            const s = Math.max(iw / b.width, ih / b.height);
            ctx.save();
            ctx.beginPath(); ctx.rect(x, y, iw, ih); ctx.clip();
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(b, x + (iw - b.width * s) / 2, y + (ih - b.height * s) / 2, b.width * s, b.height * s);
            ctx.restore();
            break;
          }
        // falls through
        default: {
          const pat = ctx.createPattern(st.theme === 'dark' ? checker.current!.dark : checker.current!.light, 'repeat')!;
          ctx.fillStyle = pat;
          ctx.fillRect(x, y, iw, ih);
        }
      }
    };

    const drawSource = (src: 'original' | 'result' | 'mask', ox: number) => {
      const x = ox + tx, y = ty, iw = IW * scale, ih = IH * scale;
      ctx.imageSmoothingEnabled = smooth;
      ctx.imageSmoothingQuality = 'high';
      if (src === 'mask') {
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, iw, ih);
        if (mask) ctx.drawImage(mask, x, y, iw, ih);
        return;
      }
      if (src === 'result' && v.overlay && mask) {
        drawBg(x, y, iw, ih);
        ctx.drawImage(engine.originalCanvas!, x, y, iw, ih);
        // red tint where pixels are removed
        if (!tint.current) tint.current = document.createElement('canvas');
        const t = tint.current;
        if (t.width !== Math.ceil(w * dpr) || t.height !== Math.ceil(h * dpr)) { t.width = Math.ceil(w * dpr); t.height = Math.ceil(h * dpr); }
        const g = t.getContext('2d')!;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.globalCompositeOperation = 'source-over';
        g.clearRect(0, 0, w, h);
        g.fillStyle = 'rgb(255,45,95)';
        g.fillRect(x, y, iw, ih);
        g.globalCompositeOperation = 'destination-out';
        g.imageSmoothingEnabled = smooth;
        g.drawImage(mask, x, y, iw, ih);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = v.overlayOpacity / 100;
        ctx.drawImage(t, 0, 0);
        ctx.restore();
        return;
      }
      drawBg(x, y, iw, ih);
      ctx.drawImage(src === 'original' ? engine.originalCanvas! : engine.resultCanvas!, x, y, iw, ih);
    };

    for (let p = 0; p < panes; p++) {
      const ox = p * paneW;
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox, 0, paneW, h);
      ctx.clip();
      if (v.mode === 'side') drawSource(p === 0 ? 'original' : 'result', ox);
      else if (v.mode === 'original') drawSource('original', 0);
      else if (v.mode === 'mask') drawSource('mask', 0);
      else drawSource('result', 0);
      if (v.mode === 'split') {
        const sx = v.split * w;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, sx, h);
        ctx.clip();
        drawSource('original', 0);
        ctx.restore();
      }
      // pixel grid at high zoom
      if (scale >= 12) {
        const x0 = Math.max(0, Math.floor((ox - (ox + tx)) / scale)), x1 = Math.min(IW, Math.ceil((ox + paneW - (ox + tx)) / scale));
        const y0 = Math.max(0, Math.floor(-ty / scale)), y1 = Math.min(IH, Math.ceil((h - ty) / scale));
        ctx.strokeStyle = 'rgba(128,128,128,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = x0; x <= x1; x++) { const px = Math.round(ox + tx + x * scale) + 0.5; ctx.moveTo(px, ty + y0 * scale); ctx.lineTo(px, ty + y1 * scale); }
        for (let y = y0; y <= y1; y++) { const py = Math.round(ty + y * scale) + 0.5; ctx.moveTo(ox + tx + x0 * scale, py); ctx.lineTo(ox + tx + x1 * scale, py); }
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(124,140,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + tx - 0.5, ty - 0.5, IW * scale + 1, IH * scale + 1);
      if (v.mode === 'side') {
        ctx.font = '600 11px Inter, system-ui, sans-serif';
        const label = p === 0 ? BEFORE : AFTER;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(ox + 10, 10, ctx.measureText(label).width + 16, 20);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, ox + 18, 24);
      }
      ctx.restore();
    }
    if (v.mode === 'side') {
      ctx.fillStyle = 'rgba(124,140,255,0.6)';
      ctx.fillRect(paneW - 0.5, 0, 1, h);
    }
    if (v.mode === 'split') {
      const sx = Math.round(v.split * w);
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx - 1, 0, 2, h);
      ctx.beginPath();
      ctx.arc(sx, h / 2, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#4652e0';
      ctx.beginPath(); ctx.moveTo(sx - 4, h / 2 - 5); ctx.lineTo(sx - 9, h / 2); ctx.lineTo(sx - 4, h / 2 + 5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(sx + 4, h / 2 - 5); ctx.lineTo(sx + 9, h / 2); ctx.lineTo(sx + 4, h / 2 + 5); ctx.fill();
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      const bw = ctx.measureText(BEFORE).width + 16, aw = ctx.measureText(AFTER).width + 16;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(10, 10, bw, 20); ctx.fillRect(w - 10 - aw, 10, aw, 20);
      ctx.fillStyle = '#fff';
      ctx.fillText(BEFORE, 18, 24); ctx.fillText(AFTER, w - 2 - aw, 24);
    }
    // brush cursor
    const hv = hover.current;
    if (hv && (st.tool === 'erase' || st.tool === 'restore') && !drag.current?.kind.startsWith('p')) {
      const paneOx = panes === 2 && hv.sx >= paneW ? paneW : 0;
      const r = Math.max(0.5, st.brush.size / 2) * scale;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = st.tool === 'erase' ? 'rgba(255,90,120,0.95)' : 'rgba(80,220,140,0.95)';
      ctx.beginPath();
      if (st.brush.size <= 1.5) {
        ctx.rect(paneOx + tx + Math.floor(hv.ix) * scale, ty + Math.floor(hv.iy) * scale, scale, scale);
      } else {
        ctx.arc(paneOx + tx + hv.ix * scale, ty + hv.iy * scale, r, 0, Math.PI * 2);
      }
      ctx.stroke();
      if (st.brush.size > 1.5 && st.settings.mode !== 'pixel' && st.brush.hardness < 100) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(paneOx + tx + hv.ix * scale, ty + hv.iy * scale, r * (st.brush.hardness / 100), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    drawLoupe();
  }, []);

  const drawLoupe = () => {
    const lc = loupeRef.current;
    const hv = hover.current;
    const st = useStudio.getState();
    if (!lc || !hv || !hv.inside || !(st.view.loupe || st.tool === 'eyedropper') || !engine.resultCanvas) return;
    const g = lc.getContext('2d')!;
    const N = 11, Z = 12;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, N * Z, N * Z);
    const cx = Math.floor(hv.ix), cy = Math.floor(hv.iy);
    const showOriginal = st.tool === 'eyedropper' || st.view.mode === 'original';
    if (!showOriginal) {
      const pat = g.createPattern(checker.current?.dark ?? makeChecker(true), 'repeat')!;
      g.fillStyle = pat;
      g.fillRect(0, 0, N * Z, N * Z);
    }
    const src = showOriginal ? engine.originalCanvas! : st.view.mode === 'mask' ? engine.getMaskCanvas()! : engine.resultCanvas;
    if (st.view.mode === 'mask') { g.fillStyle = '#000'; g.fillRect(0, 0, N * Z, N * Z); }
    g.drawImage(src, cx - 5, cy - 5, N, N, 0, 0, N * Z, N * Z);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    for (let i = 0; i <= N; i++) { g.moveTo(i * Z + 0.5, 0); g.lineTo(i * Z + 0.5, N * Z); g.moveTo(0, i * Z + 0.5); g.lineTo(N * Z, i * Z + 0.5); }
    g.stroke();
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.strokeRect(5 * Z + 1, 5 * Z + 1, Z - 2, Z - 2);
    g.lineWidth = 1;
  };

  const requestRender = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(render);
  }, [render]);

  const clampXf = () => {
    const x = xf.current;
    x.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, x.scale));
  };

  const publishZoom = () => useStudio.getState().setView({ zoom: xf.current.scale });

  const fit = useCallback(() => {
    if (!engine.w) return;
    const { w, h } = size.current;
    const paneW = useStudio.getState().view.mode === 'side' ? w / 2 : w;
    let s = Math.min((paneW - 48) / engine.w, (h - 48) / engine.h);
    if (useStudio.getState().settings.mode === 'pixel' && s > 1) s = Math.floor(s);
    s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
    xf.current = { scale: s, tx: (paneW - engine.w * s) / 2, ty: (h - engine.h * s) / 2 };
    publishZoom();
    requestRender();
  }, [requestRender]);

  const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
    const x = xf.current;
    const { w } = size.current;
    const paneW = useStudio.getState().view.mode === 'side' ? w / 2 : w;
    const lx = sx >= paneW && useStudio.getState().view.mode === 'side' ? sx - paneW : sx;
    const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, x.scale * factor));
    x.tx = lx - ((lx - x.tx) * ns) / x.scale;
    x.ty = sy - ((sy - x.ty) * ns) / x.scale;
    x.scale = ns;
    publishZoom();
    requestRender();
  }, [requestRender]);

  useEffect(() => {
    viewportApi.fit = fit;
    viewportApi.actual = () => {
      const { w, h } = size.current;
      const paneW = useStudio.getState().view.mode === 'side' ? w / 2 : w;
      zoomAt(1 / xf.current.scale, paneW / 2, h / 2);
    };
    viewportApi.zoomBy = (f) => {
      const { w, h } = size.current;
      const paneW = useStudio.getState().view.mode === 'side' ? w / 2 : w;
      zoomAt(f, paneW / 2, h / 2);
    };
  }, [fit, zoomAt]);

  // resize handling
  useEffect(() => {
    const wrap = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const c = canvasRef.current!;
      const first = size.current.w === 0;
      size.current = { w: r.width, h: r.height, dpr };
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      c.style.width = `${r.width}px`;
      c.style.height = `${r.height}px`;
      if (first && engine.w) fit();
      requestRender();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [fit, requestRender]);

  // fit when a new document or comparison layout arrives
  useEffect(() => { if (doc) fit(); }, [doc?.id, view.mode === 'side', fit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { requestRender(); }, [tick, view, tool, brush, mode, theme, bgImage, lang, requestRender]);

  // keyboard: space = temporary pan
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        space.current = true;
        setCursor('grab');
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') { space.current = false; updateCursor(); }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  });

  const updateCursor = () => {
    const t = useStudio.getState().tool;
    setCursor(t === 'pan' ? 'grab' : t === 'eyedropper' ? 'crosshair' : 'none');
  };
  useEffect(updateCursor, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

  // wheel zoom (non-passive so the page doesn't scroll)
  useEffect(() => {
    const c = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      if (!engine.w) return;
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-dy * 0.0018), e.clientX - r.left, e.clientY - r.top);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const local = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  const updateHover = (sx: number, sy: number) => {
    const { x, y } = toImage(sx, sy);
    const inside = x >= 0 && y >= 0 && x < engine.w && y < engine.h;
    hover.current = { sx, sy, ix: x, iy: y, inside };
    const st = useStudio.getState();
    if (inside && (st.view.loupe || st.tool === 'eyedropper')) {
      const p = engine.pixelAt(x, y);
      setReadout(p ? { ...p, sx, sy } : null);
    } else if (readout) setReadout(null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!engine.w) return;
    const c = canvasRef.current!;
    c.setPointerCapture(e.pointerId);
    const { sx, sy } = local(e);
    pointers.current.set(e.pointerId, { x: sx, y: sy });
    const st = useStudio.getState();
    if (pointers.current.size === 2) {
      if (drag.current?.kind === 'brush') engine.endStroke();
      const [a, b] = [...pointers.current.values()];
      drag.current = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, ...xf.current };
      return;
    }
    if (st.view.mode === 'split' && Math.abs(sx - st.view.split * size.current.w) < 16 && e.button === 0) {
      drag.current = { kind: 'split' };
      return;
    }
    const { x, y } = toImage(sx, sy);
    if (e.button === 1 || e.button === 2 || space.current || st.tool === 'pan') {
      drag.current = { kind: 'pan', x: sx, y: sy, tx: xf.current.tx, ty: xf.current.ty };
      setCursor('grabbing');
      return;
    }
    if (st.tool === 'eyedropper') {
      engine.pick(x, y, e.shiftKey && (st.eyedropTarget === 'pixel' || st.eyedropTarget === 'pixel-add') ? 'pixel-add' : st.eyedropTarget);
      st.set({ tool: 'pan' });
      return;
    }
    if (st.tool === 'erase' || st.tool === 'restore') {
      if (!engine.processed) { st.toast('info', translate(st.lang, 'manual.wait')); return; }
      drag.current = { kind: 'brush' };
      engine.beginStroke(st.tool, x, y);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const { sx, sy } = local(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: sx, y: sy });
    const d = drag.current;
    if (d?.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, d.scale * (dist / d.dist)));
      xf.current = { scale: ns, tx: cx - ((d.cx - d.tx) * ns) / d.scale, ty: cy - ((d.cy - d.ty) * ns) / d.scale };
      clampXf();
      publishZoom();
      requestRender();
      return;
    }
    if (d?.kind === 'pan') {
      xf.current.tx = d.tx + (sx - d.x);
      xf.current.ty = d.ty + (sy - d.y);
      requestRender();
      return;
    }
    if (d?.kind === 'split') {
      useStudio.getState().setView({ split: Math.min(1, Math.max(0, sx / size.current.w)) });
      return;
    }
    updateHover(sx, sy);
    if (d?.kind === 'brush') {
      const { x, y } = toImage(sx, sy);
      engine.strokeTo(x, y);
    }
    requestRender();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (d?.kind === 'brush') engine.endStroke();
    if (d?.kind === 'pinch' && pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      drag.current = { kind: 'pan', x: p.x, y: p.y, tx: xf.current.tx, ty: xf.current.ty };
      return;
    }
    drag.current = null;
    if (space.current) setCursor('grab');
    else updateCursor();
  };

  const onLeave = () => {
    hover.current = null;
    setReadout(null);
    requestRender();
  };

  const showLoupe = readout && (view.loupe || tool === 'eyedropper');
  const lw = size.current.w;
  const loupeX = readout ? (readout.sx + 180 > lw ? readout.sx - 172 : readout.sx + 24) : 0;
  const loupeY = readout ? Math.max(8, readout.sy - 170) : 0;

  return (
    <div ref={wrapRef} className="relative h-full w-full touch-none overflow-hidden bg-canvas select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor: view.mode === 'split' && cursor === 'grab' ? 'grab' : cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onLeave}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={t('canvas.label')}
      />
      <div
        className="pointer-events-none absolute z-20 w-[148px] overflow-hidden rounded-xl border border-line-strong bg-panel/95 shadow-2xl backdrop-blur"
        style={{ left: loupeX, top: loupeY, display: showLoupe ? 'block' : 'none' }}
      >
        <canvas ref={loupeRef} width={132} height={132} className="pixelated m-2 block rounded-md" style={{ width: 132, height: 132 }} />
        {readout && (
          <div className="space-y-0.5 px-2.5 pb-2 font-mono text-[10px] leading-tight text-muted">
            <div className="text-fg">x {readout.x} · y {readout.y}</div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-line" style={{ background: `rgb(${readout.original.slice(0, 3).join(',')})` }} />
              {t('loupe.src')} {readout.original.join(',')}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="checker inline-block h-2.5 w-2.5 rounded-sm border border-line" style={{ backgroundImage: readout.result[3] ? 'none' : undefined, background: readout.result[3] ? `rgba(${readout.result.slice(0, 3).join(',')},${readout.result[3] / 255})` : undefined }} />
              {t('loupe.out')} {readout.result.join(',')}
            </div>
            <div className={readout.result[3] === 0 ? 'text-accent' : readout.result[3] === 255 ? 'text-success' : 'text-amber-400'}>
              {readout.result[3] === 0 ? t('loupe.transparent') : readout.result[3] === 255 ? t('loupe.opaque') : t('loupe.semi', { pct: Math.round((readout.result[3] / 255) * 100) })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
