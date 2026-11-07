/** Baseline uncompressed TIFF, 8-bit RGBA with unassociated (straight) alpha. Lossless. */
export function encodeTIFF(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number): Blob {
  const tags: [number, number, number, number[]][] = []; // tag, type, count, values
  const SHORT = 3, LONG = 4, RATIONAL = 5;
  const headerSize = 8;
  const numTags = 15;
  const ifdSize = 2 + numTags * 12 + 4;
  const bpsOffset = headerSize + ifdSize;
  const xresOffset = bpsOffset + 8;
  const yresOffset = xresOffset + 8;
  const dataOffset = yresOffset + 8;
  const dataLen = w * h * 4;
  tags.push([256, LONG, 1, [w]]);
  tags.push([257, LONG, 1, [h]]);
  tags.push([258, SHORT, 4, [bpsOffset]]);
  tags.push([259, SHORT, 1, [1]]);
  tags.push([262, SHORT, 1, [2]]);
  tags.push([273, LONG, 1, [dataOffset]]);
  tags.push([274, SHORT, 1, [1]]);
  tags.push([277, SHORT, 1, [4]]);
  tags.push([278, LONG, 1, [h]]);
  tags.push([279, LONG, 1, [dataLen]]);
  tags.push([282, RATIONAL, 1, [xresOffset]]);
  tags.push([283, RATIONAL, 1, [yresOffset]]);
  tags.push([284, SHORT, 1, [1]]);
  tags.push([296, SHORT, 1, [2]]);
  tags.push([338, SHORT, 1, [2]]);
  const head = new Uint8Array(dataOffset);
  const dv = new DataView(head.buffer);
  head[0] = 0x49; head[1] = 0x49; // II little-endian
  dv.setUint16(2, 42, true);
  dv.setUint32(4, headerSize, true);
  let p = headerSize;
  dv.setUint16(p, numTags, true);
  p += 2;
  for (const [tag, type, count, vals] of tags) {
    dv.setUint16(p, tag, true);
    dv.setUint16(p + 2, type, true);
    dv.setUint32(p + 4, count, true);
    if (type === SHORT && count === 1) dv.setUint16(p + 8, vals[0], true);
    else dv.setUint32(p + 8, vals[0], true);
    p += 12;
  }
  dv.setUint32(p, 0, true);
  for (let i = 0; i < 4; i++) dv.setUint16(bpsOffset + i * 2, 8, true);
  dv.setUint32(xresOffset, 72, true); dv.setUint32(xresOffset + 4, 1, true);
  dv.setUint32(yresOffset, 72, true); dv.setUint32(yresOffset + 4, 1, true);
  return new Blob([head as BlobPart, rgba as BlobPart], { type: 'image/tiff' });
}
