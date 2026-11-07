export const ACCEPTED: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
  'image/bmp': 'BMP',
  'image/x-ms-bmp': 'BMP',
  'image/gif': 'GIF',
  'image/avif': 'AVIF',
};
const EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif', avif: 'image/avif' };
export const ACCEPT_ATTR = '.png,.jpg,.jpeg,.jfif,.webp,.bmp,.gif,.avif,image/png,image/jpeg,image/webp,image/bmp,image/gif,image/avif';
export const MAX_PIXELS = 64_000_000;

export interface Decoded {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  format: string;
  notes: string[];
}

export function detectType(file: File): string | null {
  if (file.type && ACCEPTED[file.type]) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT[ext] ?? null;
}

async function sniff(file: File): Promise<string | null> {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const s = String.fromCharCode(...b);
  if (b[0] === 0x89 && s.slice(1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (s.startsWith('RIFF') && s.slice(8, 12) === 'WEBP') return 'image/webp';
  if (s.startsWith('BM')) return 'image/bmp';
  if (s.startsWith('GIF8')) return 'image/gif';
  if (s.slice(4, 12) === 'ftypavif' || s.slice(4, 12) === 'ftypavis') return 'image/avif';
  return null;
}

/** Decodes at FULL resolution without color-space conversion so pixel values stay as stored in the file. */
export async function decodeImage(file: File): Promise<Decoded> {
  const declared = detectType(file);
  const real = await sniff(file);
  const type = real ?? declared;
  if (!type) throw new Error(`"${file.name}" is not a supported image. Use PNG, JPG, WEBP, BMP, GIF or AVIF.`);
  const notes: string[] = [];
  if (type === 'image/gif') notes.push('GIF: only the first frame is processed (animation is not supported).');
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { colorSpaceConversion: 'none', premultiplyAlpha: 'none', imageOrientation: 'from-image' });
  } catch {
    if (type === 'image/avif') throw new Error('This browser cannot decode AVIF images. Try Chrome, Edge, Firefox or Safari 16+.');
    throw new Error(`Could not decode "${file.name}". The file may be corrupted.`);
  }
  const { width, height } = bmp;
  if (width * height > MAX_PIXELS) {
    bmp.close();
    throw new Error(`Image is ${width}×${height} (${((width * height) / 1e6).toFixed(1)} MP). The maximum is ${MAX_PIXELS / 1e6} MP.`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const rgba = ctx.getImageData(0, 0, width, height).data;
  canvas.width = canvas.height = 0; // release backing store
  return { rgba, width, height, format: ACCEPTED[type] ?? type, notes };
}

export function makeThumb(rgba: Uint8ClampedArray, w: number, h: number, size = 96): string {
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  src.getContext('2d')!.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  const s = Math.min(1, size / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  src.width = src.height = 0;
  return c.toDataURL('image/png');
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
