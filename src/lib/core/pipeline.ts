import type { RGB, Settings } from './types.ts';
import { chromaAlpha, pixelAlpha } from './keyers.ts';
import { cleanComponents, feather, guidedFilter, morphShift } from './morph.ts';
import { isChromatic } from './color.ts';

export interface ProcessInput {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  settings: Settings;
  /** Full-resolution AI mask (required in AI mode). */
  aiMask?: Uint8Array | null;
  /** Manual foreground protection layer (non-zero = protected). */
  protect?: Uint8Array | null;
  onStage?: (stage: string) => void;
}

/**
 * Produces a straight-alpha RGBA buffer. Opaque pixels keep their original RGB values
 * untouched unless spill suppression explicitly targets them. Fully transparent pixels get RGB 0.
 */
export function processImage(input: ProcessInput): Uint8ClampedArray {
  const { rgba, width: w, height: h, settings, protect } = input;
  const n = w * h;
  const { mode, refine } = settings;
  const stage = input.onStage ?? (() => {});

  stage('Keying');
  let alpha: Uint8Array;
  if (mode === 'chroma') alpha = chromaAlpha(rgba, w, h, settings.chroma, protect);
  else if (mode === 'pixel') alpha = pixelAlpha(rgba, w, h, settings.pixel, protect);
  else {
    if (!input.aiMask || input.aiMask.length !== n) throw new Error('AI mask is not available yet.');
    alpha = new Uint8Array(input.aiMask);
    if (settings.ai.smartEdges) {
      stage('Edge-aware refinement');
      const r = Math.max(2, Math.round((settings.ai.edgeRadius * Math.max(w, h)) / 1024));
      const guided = guidedFilter(rgba, alpha, w, h, r);
      // only replace inside the uncertain band around the edge
      const hi = morphShift(alpha, w, h, r);
      const lo = morphShift(alpha, w, h, -r);
      for (let i = 0; i < n; i++) if (hi[i] - lo[i] > 24) alpha[i] = guided[i];
    }
  }

  stage('Refining edges');
  if (refine.invert) for (let i = 0; i < n; i++) alpha[i] = 255 - alpha[i];

  if (mode === 'pixel') {
    // pixel art stays strictly binary
    if (refine.shift) alpha = morphShift(alpha, w, h, refine.shift);
    alpha = cleanComponents(alpha, w, h, refine.residueSize, refine.holeSize);
  } else {
    const lo = Math.min(refine.alphaLow, refine.alphaHigh - 1);
    const hi = Math.max(refine.alphaHigh, lo + 1);
    if (lo > 0 || hi < 255) {
      const lut = new Uint8Array(256);
      for (let v = 0; v < 256; v++) lut[v] = v <= lo ? 0 : v >= hi ? 255 : Math.round(((v - lo) / (hi - lo)) * 255);
      for (let i = 0; i < n; i++) alpha[i] = lut[alpha[i]];
    }
    if (refine.shift) alpha = morphShift(alpha, w, h, refine.shift);
    alpha = cleanComponents(alpha, w, h, refine.residueSize, refine.holeSize);
    if (refine.feather > 0) alpha = feather(alpha, w, h, refine.feather);
  }
  if (protect) for (let i = 0; i < n; i++) if (protect[i] && alpha[i] < 255 && !refine.invert) alpha[i] = 255;

  stage('Compositing');
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = Math.round((alpha[i] * rgba[o + 3]) / 255);
    if (a === 0) continue; // RGB stays 0: no background color leaks into transparent pixels
    out[o] = rgba[o];
    out[o + 1] = rgba[o + 1];
    out[o + 2] = rgba[o + 2];
    out[o + 3] = a;
  }

  if (mode !== 'pixel' || refine.decontaminate || refine.spill > 0) {
    const key: RGB = mode === 'pixel' ? settings.pixel.keys[0] ?? { r: 0, g: 255, b: 0 } : settings.chroma.key;
    if (refine.decontaminate) {
      stage('Removing background contamination');
      decontaminate(out, rgba, w, h, mode === 'ai' ? null : key);
    }
    if (refine.spill > 0 && isChromatic(key)) {
      stage('Suppressing color spill');
      suppressSpill(out, w, h, key, refine.spill / 100, refine.spillScope, Math.max(2, Math.round(refine.feather) + 2));
    }
  }
  return out;
}

/**
 * Semi-transparent edge pixels are a mix of foreground F and background B:
 * C = a·F + (1-a)·B  →  F = (C - (1-a)·B) / a. B is the key color or, for AI mode,
 * an estimate of the local background color.
 */
export function decontaminate(out: Uint8ClampedArray, src: Uint8ClampedArray, w: number, h: number, fallbackKey: RGB | null) {
  const n = w * h;
  // local background estimate at reduced resolution: average of nearby fully transparent pixels
  const s = Math.max(1, Math.ceil(Math.sqrt(n / 500_000)));
  const sw = Math.ceil(w / s);
  const sh = Math.ceil(h / s);
  const sn = sw * sh;
  const bgR = new Float32Array(sn), bgG = new Float32Array(sn), bgB = new Float32Array(sn), cnt = new Float32Array(sn);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (out[i * 4 + 3] !== 0) continue;
    const j = ((y / s) | 0) * sw + ((x / s) | 0);
    bgR[j] += src[i * 4]; bgG[j] += src[i * 4 + 1]; bgB[j] += src[i * 4 + 2]; cnt[j]++;
  }
  const r = Math.max(2, Math.round(12 / s));
  const t = new Float32Array(sn);
  const spread = (arr: Float32Array) => {
    for (let y = 0; y < sh; y++) {
      let acc = 0;
      for (let x = -r; x < sw; x++) {
        if (x + r < sw) acc += arr[y * sw + x + r];
        if (x - r - 1 >= 0) acc -= arr[y * sw + x - r - 1];
        if (x >= 0) t[y * sw + x] = acc;
      }
    }
    for (let x = 0; x < sw; x++) {
      let acc = 0;
      for (let y = -r; y < sh; y++) {
        if (y + r < sh) acc += t[(y + r) * sw + x];
        if (y - r - 1 >= 0) acc -= t[(y - r - 1) * sw + x];
        if (y >= 0) arr[y * sw + x] = acc;
      }
    }
  };
  spread(bgR); spread(bgG); spread(bgB); spread(cnt);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a8 = out[o + 3];
    if (a8 === 0 || a8 === 255) continue;
    let br: number, bg: number, bb: number;
    const x = i % w, y = (i - x) / w;
    const j = ((y / s) | 0) * sw + ((x / s) | 0);
    if (cnt[j] > 0) { br = bgR[j] / cnt[j]; bg = bgG[j] / cnt[j]; bb = bgB[j] / cnt[j]; }
    else if (fallbackKey) { br = fallbackKey.r; bg = fallbackKey.g; bb = fallbackKey.b; }
    else continue;
    const a = Math.max(a8 / 255, 0.08);
    out[o] = (src[o] - (1 - a) * br) / a;
    out[o + 1] = (src[o + 1] - (1 - a) * bg) / a;
    out[o + 2] = (src[o + 2] - (1 - a) * bb) / a;
  }
}

/**
 * Removes the key's chroma component (in YCbCr) from pixels while keeping luminance.
 * Only the positive projection onto the key direction is removed, so unrelated colors are untouched.
 */
export function suppressSpill(
  out: Uint8ClampedArray,
  w: number,
  h: number,
  key: RGB,
  amount: number,
  scope: 'edges' | 'all',
  band: number,
) {
  const n = w * h;
  const kcb = -0.168736 * key.r - 0.331264 * key.g + 0.5 * key.b;
  const kcr = 0.5 * key.r - 0.418688 * key.g - 0.081312 * key.b;
  const kl = Math.hypot(kcb, kcr) || 1;
  const kx = kcb / kl, ky = kcr / kl;
  let target: Uint8Array | null = null;
  if (scope === 'edges') {
    const solid = new Uint8Array(n);
    for (let i = 0; i < n; i++) solid[i] = out[i * 4 + 3] === 255 ? 255 : 0;
    target = morphShift(solid, w, h, -band); // opaque interior that is NOT touched
  }
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (out[o + 3] === 0) continue;
    if (target && target[i] === 255) continue;
    const r = out[o], g = out[o + 1], b = out[o + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    let cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
    let cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
    const p = cb * kx + cr * ky;
    if (p <= 0) continue;
    cb -= amount * p * kx;
    cr -= amount * p * ky;
    out[o] = y + 1.402 * cr;
    out[o + 1] = y - 0.344136 * cb - 0.714136 * cr;
    out[o + 2] = y + 1.772 * cb;
  }
}
