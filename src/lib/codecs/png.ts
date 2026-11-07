import { crc32 } from './crc32.ts';

/**
 * Lossless PNG encoder (8-bit RGBA, straight alpha).
 * Unlike canvas.toBlob, the pixels never pass through a premultiplied canvas, so every
 * RGB value of every non-transparent pixel is written exactly as given.
 */
export interface PngOptions {
  /** 'adaptive' picks the best filter per row (smaller files), 'none' is faster. */
  filter?: 'adaptive' | 'none';
  /** Pixels per meter (e.g. 2835 = 72 DPI). */
  ppm?: number;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Applies PNG scanline filters. Returns the raw (pre-zlib) image data stream. */
export function filterScanlines(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, mode: 'adaptive' | 'none' = 'adaptive'): Uint8Array {
  const stride = w * 4;
  const out = new Uint8Array((stride + 1) * h);
  const cand = mode === 'adaptive' ? [new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride)] : null;
  for (let y = 0; y < h; y++) {
    const row = y * stride;
    const prev = y > 0 ? row - stride : -1;
    const dst = y * (stride + 1);
    if (!cand) {
      out[dst] = 0;
      out.set(rgba.subarray(row, row + stride), dst + 1);
      continue;
    }
    let best = 0;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const line = cand[f];
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const cur = rgba[row + x];
        const a = x >= 4 ? rgba[row + x - 4] : 0;
        const b = prev >= 0 ? rgba[prev + x] : 0;
        const c = x >= 4 && prev >= 0 ? rgba[prev + x - 4] : 0;
        let v: number;
        switch (f) {
          case 0: v = cur; break;
          case 1: v = cur - a; break;
          case 2: v = cur - b; break;
          case 3: v = cur - ((a + b) >> 1); break;
          default: v = cur - paeth(a, b, c);
        }
        v &= 0xff;
        line[x] = v;
        sum += v < 128 ? v : 256 - v;
        if (sum >= bestSum) break;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    out[dst] = best;
    out.set(cand[best], dst + 1);
  }
  return out;
}

async function zlibDeflate(data: Uint8Array): Promise<Uint8Array> {
  // 'deflate' in the Compression Streams API is the zlib format PNG requires.
  const cs = new CompressionStream('deflate');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodePNG(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, opts: PngOptions = {}): Promise<Blob> {
  if (rgba.length !== w * h * 4) throw new Error('PNG encoder: buffer size does not match dimensions');
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = filterScanlines(rgba, w, h, opts.filter ?? 'adaptive');
  const z = await zlibDeflate(raw);
  const parts: Uint8Array[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  if (opts.ppm) {
    const phys = new Uint8Array(9);
    const pv = new DataView(phys.buffer);
    pv.setUint32(0, opts.ppm);
    pv.setUint32(4, opts.ppm);
    phys[8] = 1;
    parts.push(chunk('pHYs', phys));
  }
  const MAX = 1 << 20;
  for (let i = 0; i < z.length; i += MAX) parts.push(chunk('IDAT', z.subarray(i, Math.min(z.length, i + MAX))));
  parts.push(chunk('IEND', new Uint8Array(0)));
  return new Blob(parts as BlobPart[], { type: 'image/png' });
}
