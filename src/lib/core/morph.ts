/**
 * Low-level mask operations. All functions work on flat row-major arrays of
 * size w*h and never allocate more than a few temporary buffers.
 */

/** Flood fill from every border pixel through pixels where `passable[i] !== 0`. */
export function floodFromBorder(
  passable: Uint8Array,
  w: number,
  h: number,
  diagonal = false,
  blocked?: Uint8Array | null,
): Uint8Array {
  const n = w * h;
  const reached = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const push = (i: number) => {
    if (reached[i] || !passable[i] || (blocked && blocked[i])) return;
    reached[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i - x) / w;
    const l = x > 0;
    const r = x < w - 1;
    const u = y > 0;
    const d = y < h - 1;
    if (l) push(i - 1);
    if (r) push(i + 1);
    if (u) push(i - w);
    if (d) push(i + w);
    if (diagonal) {
      if (l && u) push(i - w - 1);
      if (r && u) push(i - w + 1);
      if (l && d) push(i + w - 1);
      if (r && d) push(i + w + 1);
    }
  }
  return reached;
}

/** Sliding window min or max along lines using a monotonic deque: O(n) independent of radius. */
function slidingExtreme(
  src: Uint8Array,
  dst: Uint8Array,
  w: number,
  h: number,
  r: number,
  horizontal: boolean,
  isMax: boolean,
) {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const stride = horizontal ? 1 : w;
  const dq = new Int32Array(len);
  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * w : line;
    let qh = 0;
    let qt = 0;
    let next = 0; // next index to push
    for (let i = 0; i < len; i++) {
      const hi = Math.min(len - 1, i + r);
      while (next <= hi) {
        const v = src[base + next * stride];
        if (isMax) while (qt > qh && src[base + dq[qt - 1] * stride] <= v) qt--;
        else while (qt > qh && src[base + dq[qt - 1] * stride] >= v) qt--;
        dq[qt++] = next++;
      }
      while (dq[qh] < i - r) qh++;
      dst[base + i * stride] = src[base + dq[qh] * stride];
    }
  }
}

/** Grayscale dilation (positive radius) or erosion (negative radius) with a square structuring element. */
export function morphShift(alpha: Uint8Array, w: number, h: number, shift: number): Uint8Array {
  const r = Math.round(Math.abs(shift));
  if (r === 0) return alpha;
  const tmp = new Uint8Array(alpha.length);
  const out = new Uint8Array(alpha.length);
  const isMax = shift > 0;
  slidingExtreme(alpha, tmp, w, h, r, true, isMax);
  slidingExtreme(tmp, out, w, h, r, false, isMax);
  return out;
}

/** Separable box blur (one pass, both directions) on a Float32 array. */
function boxBlurF(src: Float32Array, dst: Float32Array, tmp: Float32Array, w: number, h: number, r: number) {
  if (r <= 0) {
    dst.set(src);
    return;
  }
  // horizontal
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    let cnt = 0;
    for (let x = 0; x <= Math.min(r, w - 1); x++) {
      acc += src[row + x];
      cnt++;
    }
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / cnt;
      const add = x + r + 1;
      const rem = x - r;
      if (add < w) {
        acc += src[row + add];
        cnt++;
      }
      if (rem >= 0) {
        acc -= src[row + rem];
        cnt--;
      }
    }
  }
  // vertical
  for (let x = 0; x < w; x++) {
    let acc = 0;
    let cnt = 0;
    for (let y = 0; y <= Math.min(r, h - 1); y++) {
      acc += tmp[y * w + x];
      cnt++;
    }
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc / cnt;
      const add = y + r + 1;
      const rem = y - r;
      if (add < h) {
        acc += tmp[add * w + x];
        cnt++;
      }
      if (rem >= 0) {
        acc -= tmp[rem * w + x];
        cnt--;
      }
    }
  }
}

/** Approximate gaussian feather (3 box passes). Only pixels near an edge actually change. */
export function feather(alpha: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const r = Math.max(0, Math.round(radius / 1.7));
  if (radius <= 0) return alpha;
  const a = Float32Array.from(alpha);
  const b = new Float32Array(alpha.length);
  const t = new Float32Array(alpha.length);
  boxBlurF(a, b, t, w, h, Math.max(1, r));
  boxBlurF(b, a, t, w, h, Math.max(1, r));
  boxBlurF(a, b, t, w, h, Math.max(1, r));
  const out = new Uint8Array(alpha.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(b[i]);
  return out;
}

/**
 * Removes connected components of `alpha > 0` smaller than `minSize` pixels (8-connectivity),
 * and fills enclosed transparent holes smaller than `holeSize`.
 */
export function cleanComponents(alpha: Uint8Array, w: number, h: number, minSize: number, holeSize: number): Uint8Array {
  if (minSize <= 0 && holeSize <= 0) return alpha;
  const out = new Uint8Array(alpha);
  const n = w * h;
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  const pass = (wantOpaque: boolean, limit: number) => {
    seen.fill(0);
    for (let s = 0; s < n; s++) {
      if (seen[s] || (out[s] > 0) !== wantOpaque) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = s;
      seen[s] = 1;
      let touchesBorder = false;
      let tooBig = false;
      while (head < tail) {
        const i = queue[head++];
        const x = i % w;
        const y = (i - x) / w;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder = true;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if ((dx === 0 && dy === 0) || xx < 0 || xx >= w) continue;
            // holes use 4-connectivity so diagonal subject gaps don't merge holes with background
            if (!wantOpaque && dx !== 0 && dy !== 0) continue;
            const j = yy * w + xx;
            if (seen[j] || (out[j] > 0) !== wantOpaque) continue;
            seen[j] = 1;
            queue[tail++] = j;
          }
        }
        if (tail >= limit) tooBig = true;
      }
      if (tooBig) continue;
      if (wantOpaque && tail < limit) {
        for (let k = 0; k < tail; k++) out[queue[k]] = 0;
      } else if (!wantOpaque && !touchesBorder && tail < limit) {
        for (let k = 0; k < tail; k++) out[queue[k]] = 255;
      }
    }
  };
  if (minSize > 0) pass(true, minSize);
  if (holeSize > 0) pass(false, holeSize);
  return out;
}

/** Bilinear resize of a single-channel float mask (values 0..1) to a Uint8 mask. */
export function resizeMask(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const out = new Uint8Array(dw * dh);
  const sx = sw / dw;
  const sy = sh / dh;
  for (let y = 0; y < dh; y++) {
    let fy = (y + 0.5) * sy - 0.5;
    if (fy < 0) fy = 0;
    const y0 = Math.min(sh - 1, Math.floor(fy));
    const y1 = Math.min(sh - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < dw; x++) {
      let fx = (x + 0.5) * sx - 0.5;
      if (fx < 0) fx = 0;
      const x0 = Math.min(sw - 1, Math.floor(fx));
      const x1 = Math.min(sw - 1, x0 + 1);
      const wx = fx - x0;
      const top = src[y0 * sw + x0] * (1 - wx) + src[y0 * sw + x1] * wx;
      const bot = src[y1 * sw + x0] * (1 - wx) + src[y1 * sw + x1] * wx;
      const v = (top * (1 - wy) + bot * wy) * 255;
      out[y * dw + x] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return out;
}

/**
 * Edge-aware mask refinement: (fast) guided filter with the original image's luminance
 * as guide. Snaps a coarse AI mask to real image edges (hair, fur, outlines).
 */
export function guidedFilter(
  rgba: Uint8ClampedArray,
  mask: Uint8Array,
  w: number,
  h: number,
  radius: number,
  eps = 1e-3,
): Uint8Array {
  // subsample for large images to bound memory/time (fast guided filter, He & Sun 2015)
  const s = Math.max(1, Math.ceil(Math.sqrt((w * h) / 2_000_000)));
  const sw = Math.ceil(w / s);
  const sh = Math.ceil(h / s);
  const n = sw * sh;
  const I = new Float32Array(n);
  const P = new Float32Array(n);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const ox = Math.min(w - 1, x * s);
      const oy = Math.min(h - 1, y * s);
      const o = oy * w + ox;
      I[y * sw + x] = (0.299 * rgba[o * 4] + 0.587 * rgba[o * 4 + 1] + 0.114 * rgba[o * 4 + 2]) / 255;
      P[y * sw + x] = mask[o] / 255;
    }
  }
  const r = Math.max(1, Math.round(radius / s));
  const tmp = new Float32Array(n);
  const meanI = new Float32Array(n);
  const meanP = new Float32Array(n);
  const corr = new Float32Array(n);
  const work = new Float32Array(n);
  boxBlurF(I, meanI, tmp, sw, sh, r);
  boxBlurF(P, meanP, tmp, sw, sh, r);
  for (let i = 0; i < n; i++) work[i] = I[i] * P[i];
  boxBlurF(work, corr, tmp, sw, sh, r); // corrIP
  for (let i = 0; i < n; i++) work[i] = I[i] * I[i];
  boxBlurF(work, P, tmp, sw, sh, r); // P now holds corrII
  // a -> work, b -> I (reuse buffers)
  for (let i = 0; i < n; i++) {
    const varI = P[i] - meanI[i] * meanI[i];
    const cov = corr[i] - meanI[i] * meanP[i];
    const a = cov / (varI + eps);
    work[i] = a;
    I[i] = meanP[i] - a * meanI[i];
  }
  boxBlurF(work, corr, tmp, sw, sh, r); // mean a
  boxBlurF(I, meanP, tmp, sw, sh, r); // mean b
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1, y / s);
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1, x / s);
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const wx = fx - x0;
      const i00 = y0 * sw + x0, i01 = y0 * sw + x1, i10 = y1 * sw + x0, i11 = y1 * sw + x1;
      const a = (corr[i00] * (1 - wx) + corr[i01] * wx) * (1 - wy) + (corr[i10] * (1 - wx) + corr[i11] * wx) * wy;
      const b = (meanP[i00] * (1 - wx) + meanP[i01] * wx) * (1 - wy) + (meanP[i10] * (1 - wx) + meanP[i11] * wx) * wy;
      const o = y * w + x;
      const lum = (0.299 * rgba[o * 4] + 0.587 * rgba[o * 4 + 1] + 0.114 * rgba[o * 4 + 2]) / 255;
      const v = (a * lum + b) * 255;
      out[o] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return out;
}
