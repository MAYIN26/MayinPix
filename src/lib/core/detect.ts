import type { ChromaParams, Mode, RGB } from './types.ts';
import { hcv, hueDistance, isChromatic } from './color.ts';

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
/**
 * Pixel art has few colors, blocky structure and NO anti-aliasing. Anti-aliased artwork
 * (logos, illustrations) has edge pixels that are blends between the background and the
 * neighbouring subject color; we measure that directly.
 */
export function looksLikePixelArt(rgba: Uint8ClampedArray, w: number, h: number, bg?: RGB | null): boolean {
  if (Math.max(w, h) > 1024 || w < 2 || h < 2) return false;
  const colors = new Set<number>();
  for (let o = 0; o < rgba.length; o += 4) {
    colors.add((rgba[o] << 16) | (rgba[o + 1] << 8) | rgba[o + 2]);
    if (colors.size > 256) return false;
  }
  const px = new Uint32Array(rgba.buffer, rgba.byteOffset, w * h);
  let edges = 0;
  let isolated = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const c = px[i];
    const l = x > 0 ? px[i - 1] : c, r = x < w - 1 ? px[i + 1] : c, u = y > 0 ? px[i - w] : c, d = y < h - 1 ? px[i + w] : c;
    if (l !== c || r !== c || u !== c || d !== c) edges++;
    if ((x > 0 ? l !== c : true) && (x < w - 1 ? r !== c : true) && (y > 0 ? u !== c : true) && (y < h - 1 ? d !== c : true)) isolated++;
  }
  if (!edges || isolated / edges >= 0.15) return false;
  return !bg || antiAliasRatio(rgba, w, h, bg) < 0.12;
}

/**
 * Share of subject pixels touching the background whose color is a blend between the
 * background and the pixel on their other side (the signature of anti-aliasing).
 */
export function antiAliasRatio(rgba: Uint8ClampedArray, w: number, h: number, bg: RGB): number {
  const isBg = (o: number) => Math.abs(rgba[o] - bg.r) + Math.abs(rgba[o + 1] - bg.g) + Math.abs(rgba[o + 2] - bg.b) <= 6;
  let touching = 0;
  let blends = 0;
  const dirs = [1, 0, -1, 0, 0, 1, 0, -1];
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const o = (y * w + x) * 4;
    if (isBg(o)) continue;
    for (let k = 0; k < 8; k += 2) {
      const dx = dirs[k], dy = dirs[k + 1];
      const n = ((y + dy) * w + x + dx) * 4;
      if (!isBg(n)) continue;
      touching++;
      // walk inward up to 2 px to find the subject color on the opposite side
      for (let s = 1; s <= 2; s++) {
        const q = ((y - dy * s) * w + x - dx * s) * 4;
        if (isBg(q)) break;
        const fr = rgba[q] - bg.r, fg = rgba[q + 1] - bg.g, fb = rgba[q + 2] - bg.b;
        const len2 = fr * fr + fg * fg + fb * fb;
        if (len2 < 900) continue;
        const pr = rgba[o] - bg.r, pg = rgba[o + 1] - bg.g, pb = rgba[o + 2] - bg.b;
        const t = (pr * fr + pg * fg + pb * fb) / len2;
        const er = pr - t * fr, eg = pg - t * fg, eb = pb - t * fb;
        if (t > 0.08 && t < 0.92 && er * er + eg * eg + eb * eb < 400) { blends++; break; }
      }
      break;
    }
  }
  return touching ? blends / touching : 0;
}

/** RMS deviation (RGB units) of the border pixels that belong to the dominant background color. */
export function borderNoise(rgba: Uint8ClampedArray, w: number, h: number, c: RGB): number {
  let sum = 0, n = 0;
  const visit = (x: number, y: number) => {
    const o = (y * w + x) * 4;
    const dr = rgba[o] - c.r, dg = rgba[o + 1] - c.g, db = rgba[o + 2] - c.b;
    const d2 = dr * dr + dg * dg + db * db;
    if (d2 > 40 * 40) return; // not background
    sum += d2; n++;
  };
  for (let x = 0; x < w; x++) { visit(x, 0); visit(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { visit(0, y); visit(w - 1, y); }
  return n ? Math.sqrt(sum / n) : 0;
}

/**
 * Photos have many colors and almost no perfectly flat neighbouring pixels; graphics
 * (logos, illustrations, renders on solid backgrounds) are mostly flat regions.
 */
export function looksLikePhoto(rgba: Uint8ClampedArray, w: number, h: number): boolean {
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 400_000)));
  const colors = new Set<number>();
  let flat = 0, total = 0;
  for (let y = 0; y < h; y += step) for (let x = 0; x + 1 < w; x += step) {
    const o = (y * w + x) * 4;
    if (colors.size <= 20000) colors.add((rgba[o] << 16) | (rgba[o + 1] << 8) | rgba[o + 2]);
    total++;
    if (Math.abs(rgba[o] - rgba[o + 4]) <= 2 && Math.abs(rgba[o + 1] - rgba[o + 5]) <= 2 && Math.abs(rgba[o + 2] - rgba[o + 6]) <= 2) flat++;
  }
  return colors.size > 6000 && flat / total < 0.6;
}

export type ImageKind = 'pixel' | 'graphic' | 'photo';

export interface Analysis {
  border: BorderColor | null;
  colors: number;
  kind: ImageKind;
  suggestedMode: Mode;
  isPixelArt: boolean;
  /** Color-key defaults tuned for this image's background. */
  chroma: Pick<ChromaParams, 'tolerance' | 'softness' | 'hueSensitivity'>;
}

/**
 * Key settings for a background color: colored screens are matched by hue (lighting varies
 * across a real screen); white/black/grey or flat graphic backgrounds use a tight RGB
 * tolerance derived from the background's own noise so light subject colors survive.
 */
export function chromaDefaultsFor(key: RGB, noise: number, kind: ImageKind): Analysis['chroma'] {
  const screen = isChromatic(key) && kind === 'photo';
  if (screen) return { tolerance: 22, softness: 10, hueSensitivity: 60 };
  // anti-aliased edges are handled by the edge matte, so the soft band only has to absorb background noise
  const tol = Math.min(12, Math.max(1, ((noise * 3 + 4) / 441.67) * 100));
  const soft = Math.min(10, Math.max(0.5, ((noise * 2) / 441.67) * 100));
  return { tolerance: Math.round(tol * 2) / 2, softness: Math.round(soft * 2) / 2, hueSensitivity: 0 };
}

export function analyzeImage(rgba: Uint8ClampedArray, w: number, h: number): Analysis {
  const border = dominantBorderColor(rgba, w, h);
  const colors = countColors(rgba, 1024);
  const isPixelArt = looksLikePixelArt(rgba, w, h, border && border.coverage > 0.3 ? border.color : null);
  const noise = border ? borderNoise(rgba, w, h, border.color) : 0;
  // graphics have (near) perfectly uniform backgrounds; photographed backgrounds have gradients and sensor noise
  const kind: ImageKind = isPixelArt ? 'pixel' : noise > 6 || looksLikePhoto(rgba, w, h) ? 'photo' : 'graphic';
  let suggestedMode: Mode = 'ai';
  if (kind === 'pixel' && border && border.coverage > 0.5) suggestedMode = 'pixel';
  else if (kind === 'graphic' && border && border.coverage > 0.6) suggestedMode = 'chroma';
  else if (kind === 'photo' && border && border.coverage > 0.6 && isChromatic(border.color)) suggestedMode = 'chroma'; // real green/blue screen
  const chroma = chromaDefaultsFor(border?.color ?? { r: 0, g: 177, b: 64 }, noise, kind);
  return { border, colors, kind, suggestedMode, isPixelArt, chroma };
}
