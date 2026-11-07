export interface Layers {
  /** Original straight-alpha pixels. */
  original: Uint8ClampedArray;
  /** Output of the automatic pipeline. */
  processed: Uint8ClampedArray;
  /** Manual eraser coverage 0..255. */
  erase: Uint8Array;
  /** Manual restore / protect coverage 0..255. */
  protect: Uint8Array;
}

/**
 * Combines automatic result with manual brush layers into `out` for a rectangle.
 * Restored pixels always take the ORIGINAL RGB values, never a recomputed color.
 */
export function compositeRect(
  L: Layers,
  out: Uint8ClampedArray,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const { original, processed, erase, protect } = L;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      const o = i * 4;
      const e = erase[i];
      const p = protect[i];
      const base = processed[o + 3];
      const a1 = e ? Math.round((base * (255 - e)) / 255) : base;
      const ap = p ? Math.round((p * original[o + 3]) / 255) : 0;
      if (ap > a1) {
        out[o] = original[o];
        out[o + 1] = original[o + 1];
        out[o + 2] = original[o + 2];
        out[o + 3] = ap;
      } else if (a1 === 0) {
        out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
      } else {
        out[o] = processed[o];
        out[o + 1] = processed[o + 1];
        out[o + 2] = processed[o + 2];
        out[o + 3] = a1;
      }
    }
  }
}
