import { hcv, hueDistance, isChromatic } from './color.ts';
import type { ChromaParams, PixelParams, RGB } from './types.ts';
import { floodFromBorder, morphShift } from './morph.ts';

const MAX_RGB_DIST = Math.sqrt(3 * 255 * 255);

/**
 * Chroma key: computes a per-pixel alpha from the distance to the key color.
 * Chromatic keys (green/blue/red screens) blend RGB distance with hue distance so that
 * lighting variation on the screen is still keyed. Achromatic keys (white/black/grey)
 * use RGB distance only.
 */
export function chromaAlpha(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  p: ChromaParams,
  protect?: Uint8Array | null,
): Uint8Array {
  const n = w * h;
  const out = new Uint8Array(n);
  const { r: kr, g: kg, b: kb } = p.key;
  const chromatic = isChromatic(p.key);
  const [kh] = hcv(kr, kg, kb);
  const hs = chromatic ? p.hueSensitivity / 100 : 0;
  const tol = p.tolerance / 100;
  const soft = Math.max(1e-4, p.softness / 100);
  const satThr = p.satThreshold / 100;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
    const dr = r - kr, dg = g - kg, db = b - kb;
    const dRgb = Math.sqrt(dr * dr + dg * dg + db * db) / MAX_RGB_DIST;
    let d = dRgb;
    if (chromatic) {
      const [ph, pc] = hcv(r, g, b);
      if (pc < satThr) {
        out[i] = 255;
        continue;
      }
      const dHue = hueDistance(ph, kh) / 180;
      d = hs * dHue + (1 - hs) * dRgb;
    }
    let a: number;
    if (d <= tol) a = 0;
    else if (d >= tol + soft) a = 255;
    else a = Math.round(((d - tol) / soft) * 255);
    out[i] = a;
  }
  if (p.matte) edgeMatte(rgba, out, w, h, p.key);
  if (protect) for (let i = 0; i < n; i++) if (protect[i]) out[i] = 255;
  if (p.edgeConnected) restrictToBorder(out, w, h, false, protect);
  return out;
}

/**
 * Edge matte for any key color (white, black, grey, green…). An anti-aliased edge pixel P is a
 * blend of the local background B and the subject color F next to it: P = a·F + (1-a)·B.
 * F is estimated as the neighbour that extends furthest from B in P's direction, so
 * a = |P - B| / proj(F - B). Only pixels within 2 px of the removed background are touched,
 * so the subject interior keeps alpha 255 and its exact colors.
 */
export function edgeMatte(rgba: Uint8ClampedArray, alpha: Uint8Array, w: number, h: number, key: RGB) {
  const n = w * h;
  const R = 2;
  const bg = new Uint8Array(n);
  for (let i = 0; i < n; i++) bg[i] = alpha[i] === 0 ? 255 : 0;
  const near = morphShift(bg, w, h, R);
  const out = new Uint8Array(alpha);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!near[i] || alpha[i] === 0) continue;
    // local background: average original color of removed pixels nearby (handles gradients / vignetting)
    let br = 0, bgc = 0, bb = 0, bn = 0;
    const y0 = Math.max(0, y - 3), y1 = Math.min(h - 1, y + 3), x0 = Math.max(0, x - 3), x1 = Math.min(w - 1, x + 3);
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const j = yy * w + xx;
      if (alpha[j] !== 0) continue;
      br += rgba[j * 4]; bgc += rgba[j * 4 + 1]; bb += rgba[j * 4 + 2]; bn++;
    }
    if (bn) { br /= bn; bgc /= bn; bb /= bn; } else { br = key.r; bgc = key.g; bb = key.b; }
    const o = i * 4;
    // a pixel with many same-colored subject neighbours belongs to a flat region, not to a 1–2 px AA ramp
    let same = 0;
    for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) {
      const j = yy * w + xx;
      if (j === i || alpha[j] === 0) continue;
      const q = j * 4;
      if (Math.abs(rgba[q] - rgba[o]) + Math.abs(rgba[q + 1] - rgba[o + 1]) + Math.abs(rgba[q + 2] - rgba[o + 2]) <= 6) same++;
    }
    if (same >= 4) continue;
    const dr = rgba[o] - br, dg = rgba[o + 1] - bgc, db = rgba[o + 2] - bb;
    const len = Math.sqrt(dr * dr + dg * dg + db * db);
    if (len < 1) continue;
    const ur = dr / len, ug = dg / len, ub = db / len;
    let fmax = len;
    for (let yy = Math.max(0, y - R); yy <= Math.min(h - 1, y + R); yy++) for (let xx = Math.max(0, x - R); xx <= Math.min(w - 1, x + R); xx++) {
      const j = yy * w + xx;
      if (alpha[j] === 0) continue;
      const q = j * 4;
      const p = (rgba[q] - br) * ur + (rgba[q + 1] - bgc) * ug + (rgba[q + 2] - bb) * ub;
      if (p > fmax) fmax = p;
    }
    const a = len / fmax;
    if (a < 0.97) {
      const v = Math.round(a * 255);
      if (v < out[i]) out[i] = v;
    }
  }
  alpha.set(out);
}

/** Pixel-art keyer: binary alpha, exact or distance-limited color match, optional connectivity. */
export function pixelAlpha(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  p: PixelParams,
  protect?: Uint8Array | null,
): Uint8Array {
  const n = w * h;
  const out = new Uint8Array(n).fill(255);
  const keys = p.keys.length ? p.keys : [{ r: 0, g: 255, b: 0 }];
  const dist = p.exact ? 0 : p.distance;
  const d2 = dist * dist;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (rgba[o + 3] === 0) {
      out[i] = 0; // already transparent in the source
      continue;
    }
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
    for (let k = 0; k < keys.length; k++) {
      const kk = keys[k];
      const dr = r - kk.r, dg = g - kk.g, db = b - kk.b;
      if (dr * dr + dg * dg + db * db <= d2) {
        out[i] = 0;
        break;
      }
    }
  }
  if (protect) for (let i = 0; i < n; i++) if (protect[i]) out[i] = 255;
  if (p.connected) restrictToBorder(out, w, h, p.diagonal, protect);
  return out;
}

/** Keeps transparency only for regions reachable from the image border. Interior matches become opaque again. */
export function restrictToBorder(alpha: Uint8Array, w: number, h: number, diagonal: boolean, protect?: Uint8Array | null) {
  const n = w * h;
  const passable = new Uint8Array(n);
  for (let i = 0; i < n; i++) passable[i] = alpha[i] < 255 ? 1 : 0;
  const reached = floodFromBorder(passable, w, h, diagonal, protect);
  for (let i = 0; i < n; i++) if (!reached[i]) alpha[i] = 255;
}
