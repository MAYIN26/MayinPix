import type { RGB } from './core/types';
import { encodePNG } from './codecs/png';
import { encodeTIFF } from './codecs/tiff';

export type ExportFormat = 'png' | 'webp' | 'jpeg' | 'tiff';

export interface ExportOptions {
  format: ExportFormat;
  width: number;
  height: number;
  resample: 'nearest' | 'smooth';
  background: { type: 'transparent' } | { type: 'color'; color: RGB } | { type: 'image'; bitmap: ImageBitmap };
  /** 0..1 for WebP/JPEG */
  quality: number;
  pngFilter: 'adaptive' | 'none';
}

/** Nearest-neighbor resize on straight-alpha data: never invents colors (pixel art safe). */
export function resizeNearest(src: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dw * dh * 4);
  const src32 = new Uint32Array(src.buffer, src.byteOffset, sw * sh);
  const out32 = new Uint32Array(out.buffer);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / dw));
      out32[y * dw + x] = src32[sy * sw + sx];
    }
  }
  return out;
}

function toCanvas(rgba: Uint8ClampedArray, w: number, h: number) {
  const c = new OffscreenCanvas(w, h);
  c.getContext('2d')!.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  return c;
}

function resizeSmooth(src: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray {
  const srcC = toCanvas(src, sw, sh);
  // progressive halving keeps downscales sharp and alias-free
  let cur: OffscreenCanvas = srcC;
  let cw = sw, ch = sh;
  while (cw / 2 >= dw && ch / 2 >= dh) {
    const nw = Math.max(dw, Math.round(cw / 2)), nh = Math.max(dh, Math.round(ch / 2));
    const n = new OffscreenCanvas(nw, nh);
    const nctx = n.getContext('2d')!;
    nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(cur, 0, 0, nw, nh);
    cur = n; cw = nw; ch = nh;
  }
  const out = new OffscreenCanvas(dw, dh);
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, dw, dh);
  return ctx.getImageData(0, 0, dw, dh).data;
}

/** Straight-alpha "over" compositing onto an opaque background, done in JS for exact results. */
function flatten(rgba: Uint8ClampedArray, bg: Uint8ClampedArray) {
  for (let o = 0; o < rgba.length; o += 4) {
    const a = rgba[o + 3];
    if (a === 255) continue;
    const t = a / 255;
    rgba[o] = rgba[o] * t + bg[o] * (1 - t);
    rgba[o + 1] = rgba[o + 1] * t + bg[o + 1] * (1 - t);
    rgba[o + 2] = rgba[o + 2] * t + bg[o + 2] * (1 - t);
    rgba[o + 3] = 255;
  }
}

function backgroundPixels(opts: ExportOptions, w: number, h: number): Uint8ClampedArray | null {
  const bg = opts.background;
  if (bg.type === 'transparent') {
    if (opts.format !== 'jpeg') return null;
    return backgroundPixels({ ...opts, background: { type: 'color', color: { r: 255, g: 255, b: 255 } } }, w, h);
  }
  if (bg.type === 'color') {
    const px = new Uint8ClampedArray(w * h * 4);
    const v = (255 << 24) | (bg.color.b << 16) | (bg.color.g << 8) | bg.color.r;
    new Uint32Array(px.buffer).fill(v >>> 0);
    return px;
  }
  // image: cover-fit
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const s = Math.max(w / bg.bitmap.width, h / bg.bitmap.height);
  const dw = bg.bitmap.width * s, dh = bg.bitmap.height * s;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bg.bitmap, (w - dw) / 2, (h - dh) / 2, dw, dh);
  const px = ctx.getImageData(0, 0, w, h).data;
  for (let o = 3; o < px.length; o += 4) px[o] = 255;
  return px;
}

export async function exportImage(rgba: Uint8ClampedArray, sw: number, sh: number, opts: ExportOptions): Promise<Blob> {
  const { width: dw, height: dh } = opts;
  let px = rgba;
  if (dw !== sw || dh !== sh) px = opts.resample === 'nearest' ? resizeNearest(rgba, sw, sh, dw, dh) : resizeSmooth(rgba, sw, sh, dw, dh);
  const bg = backgroundPixels(opts, dw, dh);
  if (bg) flatten(px, bg);
  switch (opts.format) {
    case 'png':
      return encodePNG(px, dw, dh, { filter: opts.pngFilter });
    case 'tiff':
      return encodeTIFF(px, dw, dh);
    case 'webp':
    case 'jpeg': {
      const type = opts.format === 'webp' ? 'image/webp' : 'image/jpeg';
      const blob = await toCanvas(px, dw, dh).convertToBlob({ type, quality: opts.quality });
      if (blob.type !== type) throw new Error(`ENCODE_UNSUPPORTED:${opts.format.toUpperCase()}`);
      return blob;
    }
  }
}
