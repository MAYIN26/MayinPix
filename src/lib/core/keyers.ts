import { hcv, hueDistance, isChromatic } from './color.ts';
import type { ChromaParams, PixelParams } from './types.ts';
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
  // key chroma vector (YCbCr) for the color-difference matte
  const kcb = -0.168736 * kr - 0.331264 * kg + 0.5 * kb;
  const kcr = 0.5 * kr - 0.418688 * kg - 0.081312 * kb;
  const kl2 = kcb * kcb + kcr * kcr || 1;
  const useMatte = chromatic && p.matte;
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
  if (useMatte) colorDifferenceMatte(rgba, out, w, h, kcb, kcr, kl2);
  if (protect) for (let i = 0; i < n; i++) if (protect[i]) out[i] = 255;
  if (p.edgeConnected) restrictToBorder(out, w, h, false, protect);
  return out;
}

/**
 * Edge matte for colored keys. For a pixel next to the screen, the amount of key chroma it carries is
 * s = t·1 + (1-t)·s_fg, where s_fg is the key chroma of the pure foreground (estimated as the minimum
 * of s in the neighbourhood). Solving for t gives the screen fraction, so alpha = 1 - t.
 * Only pixels within a few pixels of the keyed background are affected; the subject interior is untouched.
 */
function colorDifferenceMatte(rgba: Uint8ClampedArray, alpha: Uint8Array, w: number, h: number, kcb: number, kcr: number, kl2: number) {
  const n = w * h;
  const R = 3;
  const sq = new Uint8Array(n);
  const bg = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
    const cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
    const s = (cb * kcb + cr * kcr) / kl2; // 1 = pure key
    sq[i] = Math.max(0, Math.min(255, Math.round((s + 1) * 127.5)));
    bg[i] = alpha[i] === 0 ? 255 : 0;
  }
  const near = morphShift(bg, w, h, R);
  const sMin = morphShift(sq, w, h, -R);
  const sMax = morphShift(sq, w, h, R);
  for (let i = 0; i < n; i++) {
    if (!near[i] || alpha[i] === 0) continue;
    const s = sq[i] / 127.5 - 1;
    const fg = sMin[i] / 127.5 - 1;
    const bgS = Math.max(0.5, sMax[i] / 127.5 - 1); // local screen (handles uneven lighting)
    if (fg > 0.6 || bgS - fg < 0.25 || s <= fg + 0.04) continue; // no reliable foreground nearby, or pixel is pure foreground
    const t = (s - fg) / (bgS - fg);
    const am = Math.round(Math.max(0, Math.min(1, 1 - t)) * 255);
    if (am < alpha[i]) alpha[i] = am;
  }
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
