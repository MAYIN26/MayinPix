import type { Mode, RGB } from './types.ts';
import { hcv, hueDistance } from './color.ts';

export interface BorderColor {
  color: RGB;
  /** Fraction (0..1) of border pixels close to this color. */
  coverage: number;
}

/**
 * Finds the dominant color along the image border (a 2px frame), optionally restricted
 * to a hue range (used by the one-click green/blue presets).
 */
export function dominantBorderColor(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  hueFilter?: { hue: number; range: number; minChroma: number },
): BorderColor | null {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  const visit = (x: number, y: number) => {
    const o = (y * w + x) * 4;
    if (rgba[o + 3] < 200) return;
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
    total++;
    if (hueFilter) {
      const [hh, c] = hcv(r, g, b);
      if (c < hueFilter.minChroma || hueDistance(hh, hueFilter.hue) > hueFilter.range) return;
    }
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bin = bins.get(key);
    if (bin) { bin.n++; bin.r += r; bin.g += g; bin.b += b; }
    else bins.set(key, { n: 1, r, g, b });
  };
  const band = Math.min(2, Math.floor(Math.min(w, h) / 2)) || 1;
  for (let k = 0; k < band; k++) {
    for (let x = 0; x < w; x++) { visit(x, k); visit(x, h - 1 - k); }
    for (let y = band; y < h - band; y++) { visit(k, y); visit(w - 1 - k, y); }
  }
  if (!bins.size || !total) return null;
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const v of bins.values()) if (!best || v.n > best.n) best = v;
  const b = best!;
  const color = { r: Math.round(b.r / b.n), g: Math.round(b.g / b.n), b: Math.round(b.b / b.n) };
  // coverage: border pixels within a small distance of the dominant color
  let near = 0;
  for (const [key, v] of bins) {
    const r = ((key >> 10) & 31) * 8 + 4, g = ((key >> 5) & 31) * 8 + 4, bb = (key & 31) * 8 + 4;
    if (Math.abs(r - color.r) + Math.abs(g - color.g) + Math.abs(bb - color.b) <= 36) near += v.n;
  }
  return { color, coverage: near / total };
}

/** Counts unique opaque colors, stopping early once `limit` is exceeded. */
export function countColors(rgba: Uint8ClampedArray, limit = 4096): number {
  const set = new Set<number>();
  for (let o = 0; o < rgba.length; o += 4) {
    set.add((rgba[o] << 16) | (rgba[o + 1] << 8) | rgba[o + 2]);
    if (set.size > limit) break;
  }
  return set.size;
}

export interface Analysis {
  border: BorderColor | null;
  colors: number;
  suggestedMode: Mode;
  isPixelArt: boolean;
}

/**
 * Pixel art has few colors and almost no anti-aliasing: nearly every color is used by many
 * pixels. Smooth illustrations have many rare "transition" colors along their edges.
 */
export function looksLikePixelArt(rgba: Uint8ClampedArray, w: number, h: number): boolean {
  if (Math.max(w, h) > 1024 || w < 2 || h < 2) return false;
  const colors = new Set<number>();
  for (let o = 0; o < rgba.length; o += 4) {
    colors.add((rgba[o] << 16) | (rgba[o + 1] << 8) | rgba[o + 2]);
    if (colors.size > 512) return false;
  }
  const px = new Uint32Array(rgba.buffer, rgba.byteOffset, w * h);
  let edges = 0;
  let isolated = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const c = px[i];
    const l = x > 0 ? px[i - 1] : c, r = x < w - 1 ? px[i + 1] : c, u = y > 0 ? px[i - w] : c, d = y < h - 1 ? px[i + w] : c;
    if (l !== c || r !== c || u !== c || d !== c) edges++;
    // a pixel that matches none of its neighbours is typical of anti-aliasing ramps
    if ((x > 0 ? l !== c : true) && (x < w - 1 ? r !== c : true) && (y > 0 ? u !== c : true) && (y < h - 1 ? d !== c : true)) isolated++;
  }
  return edges > 0 && isolated / edges < 0.15;
}

export function analyzeImage(rgba: Uint8ClampedArray, w: number, h: number): Analysis {
  const border = dominantBorderColor(rgba, w, h);
  const colors = countColors(rgba, 1024);
  const isPixelArt = looksLikePixelArt(rgba, w, h);
  let suggestedMode: Mode = 'ai';
  if (isPixelArt && border && border.coverage > 0.5) suggestedMode = 'pixel';
  else if (border && border.coverage > 0.7) suggestedMode = 'chroma';
  return { border, colors, suggestedMode, isPixelArt };
}
