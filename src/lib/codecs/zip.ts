import { crc32 } from './crc32.ts';

/** Minimal ZIP writer (STORE method; PNG data is already compressed). */
export async function createZip(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const data = new Uint8Array(await f.blob.arrayBuffer());
    const name = enc.encode(f.name);
    const crc = crc32(data);
    const lh = new Uint8Array(30 + name.length);
    const l = new DataView(lh.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true); // UTF-8 names
    l.setUint16(8, 0, true);
    l.setUint16(10, dosTime, true);
    l.setUint16(12, dosDate, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, data.length, true);
    l.setUint16(26, name.length, true);
    lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length);
    const c = new DataView(ch.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(12, dosTime, true);
    c.setUint16(14, dosDate, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    ch.set(name, 46);
    parts.push(lh, data);
    central.push(ch);
    offset += lh.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, offset, true);
  return new Blob([...parts, ...(central as BlobPart[]), end], { type: 'application/zip' });
}
