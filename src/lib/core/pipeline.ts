import type { RGB, Settings } from './types.ts';
import { chromaAlpha, pixelAlpha } from './keyers.ts';
import { cleanComponents, feather, floodFromBorder, guidedFilter, morphShift } from './morph.ts';
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

  stage('stage.keying');
  let alpha: Uint8Array;
  if (mode === 'chroma') alpha = chromaAlpha(rgba, w, h, settings.chroma, protect);
  else if (mode === 'pixel') alpha = pixelAlpha(rgba, w, h, settings.pixel, protect);
  else {
    if (!input.aiMask || input.aiMask.length !== n) throw new Error('AI mask is not available yet.');
    alpha = cleanAiMask(input.aiMask, w, h);
    if (settings.ai.smartEdges) {
      stage('stage.edgeAware');
      const r = Math.max(2, Math.round((settings.ai.edgeRadius * Math.max(w, h)) / 1024));
      const guided = guidedFilter(rgba, alpha, w, h, r);
      // only replace inside the uncertain band around the (cleaned) subject edge
      const hi = morphShift(alpha, w, h, r);
      const lo = morphShift(alpha, w, h, -r);
      for (let i = 0; i < n; i++) if (hi[i] - lo[i] > 24 && hi[i] === 255) alpha[i] = Math.min(guided[i], hi[i]);
    }
    clearBackgroundLookalikes(rgba, alpha, w, h);
  }

  stage('stage.refining');
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

  stage('stage.compositing');
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
      stage('stage.decont');
      decontaminate(out, rgba, w, h, mode === 'ai' ? null : key);
    }
    if (refine.spill > 0 && isChromatic(key)) {
      stage('stage.spill');
      suppressSpill(out, w, h, key, refine.spill / 100, refine.spillScope, Math.max(2, Math.round(refine.feather) + 2));
    }
  }
  return out;
}

/**
 * Segmentation models leave faint, blotchy low-confidence values across busy or noisy
 * backgrounds. Soft values are only meaningful next to the confidently detected subject
 * (hair, fur, motion blur), so everything outside a band around the confident core is
 * cleared, and tiny confident specks far from the subject are dropped.
 */
export function cleanAiMask(mask: Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h;
  // label confident regions (8-connected) and measure size + share of very confident pixels
  const label = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  const area: number[] = [];
  const solid: number[] = [];
  for (let s0 = 0; s0 < n; s0++) {
    if (mask[s0] < 128 || label[s0] !== -1) continue;
    const id = area.length;
    let head = 0, tail = 0, a = 0, sol = 0;
    queue[tail++] = s0;
    label[s0] = id;
    while (head < tail) {
      const i = queue[head++];
      a++;
      if (mask[i] >= 230) sol++;
      const x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (mask[j] >= 128 && label[j] === -1) { label[j] = id; queue[tail++] = j; }
        }
      }
    }
    area.push(a);
    solid.push(sol / a);
  }
  const largest = area.length ? Math.max(...area) : 0;
  const minCore = Math.max(64, Math.round(n * 0.0004));
  // a real subject region is mostly very confident; hallucinated background patches are fuzzy
  const keep = area.map((a, id) => a >= minCore && (solid[id] >= 0.35 || a >= largest * 0.25));
  const core = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (label[i] >= 0 && keep[label[i]]) core[i] = 255;
  const band = morphShift(core, w, h, Math.max(4, Math.round((12 * Math.max(w, h)) / 1024)));
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!band[i]) continue;
    if (label[i] >= 0 && !keep[label[i]]) continue; // dropped region
    out[i] = mask[i];
  }
  // small uncertain specks fully enclosed by the subject (e.g. inside a label or a face) are subject
  const unsure = new Uint8Array(n);
  for (let i = 0; i < n; i++) unsure[i] = out[i] < 230 ? 1 : 0;
  const outside = floodFromBorder(unsure, w, h, false);
  const maxSpeck = Math.max(32, Math.round(n * 0.0005));
  label.fill(-1);
  for (let s0 = 0; s0 < n; s0++) {
    if (!unsure[s0] || outside[s0] || label[s0] !== -1) continue;
    let head = 0, tail = 0;
    queue[tail++] = s0;
    label[s0] = 0;
    while (head < tail && tail <= maxSpeck) {
      const i = queue[head++];
      const x = i % w;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (j < 0 || j >= n || (j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue;
        if (unsure[j] && !outside[j] && label[j] === -1) { label[j] = 0; queue[tail++] = j; }
      }
    }
    if (tail <= maxSpeck && head >= tail) for (let k = 0; k < tail; k++) out[queue[k]] = 255;
  }
  return out;
}

/**
 * Uncertain (semi-transparent) AI pixels whose color matches the nearby removed background are
 * background: clear them. Two passes so the cleanup can move inward by a couple of pixels.
 * Fully opaque subject pixels are never touched.
 */
export function clearBackgroundLookalikes(rgba: Uint8ClampedArray, alpha: Uint8Array, w: number, h: number, threshold = 22) {
  const t2 = threshold * threshold;
  for (let pass = 0; pass < 2; pass++) {
    const snapshot = new Uint8Array(alpha);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = snapshot[i];
      if (a === 0 || a === 255) continue;
      let r = 0, g = 0, b = 0, c = 0;
      for (let yy = Math.max(0, y - 3); yy <= Math.min(h - 1, y + 3); yy++) for (let xx = Math.max(0, x - 3); xx <= Math.min(w - 1, x + 3); xx++) {
        const j = yy * w + xx;
        if (snapshot[j] !== 0) continue;
        r += rgba[j * 4]; g += rgba[j * 4 + 1]; b += rgba[j * 4 + 2]; c++;
      }
      if (c < 4) continue;
      const dr = rgba[i * 4] - r / c, dg = rgba[i * 4 + 1] - g / c, db = rgba[i * 4 + 2] - b / c;
      if (dr * dr + dg * dg + db * db < t2) alpha[i] = 0;
    }
  }
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
