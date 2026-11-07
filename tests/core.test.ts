import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { processImage } from '../src/lib/core/pipeline.ts';
import { DEFAULT_SETTINGS, DEFAULT_REFINE, type Settings } from '../src/lib/core/types.ts';
import { encodePNG } from '../src/lib/codecs/png.ts';
import { encodeTIFF } from '../src/lib/codecs/tiff.ts';
import { compositeRect } from '../src/lib/core/composite.ts';
import { analyzeImage, dominantBorderColor } from '../src/lib/core/detect.ts';

const GREEN = [0, 255, 0];

/** 32x32 green background, sprite with outline, skin, and a GREEN gem inside (same green as the background). */
function makeSprite() {
  const w = 32, h = 32;
  const px = new Uint8ClampedArray(w * h * 4);
  const set = (x: number, y: number, c: number[]) => { const o = (y * w + x) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, GREEN);
  for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) {
    const edge = x === 8 || x === 23 || y === 8 || y === 23;
    set(x, y, edge ? [20, 12, 40] : [240, 190, 150]);
  }
  for (let y = 14; y < 18; y++) for (let x = 14; x < 18; x++) set(x, y, GREEN); // interior green
  set(9, 9, [255, 255, 255]); // white highlight detail (1px)
  return { w, h, px };
}

function settings(mode: Settings['mode'], patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, mode, refine: DEFAULT_REFINE[mode], ...patch };
}

test('pixel mode removes border-connected green and preserves every sprite pixel', () => {
  const { w, h, px } = makeSprite();
  const out = processImage({ rgba: px, width: w, height: h, settings: settings('pixel') });
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const x = i % w, y = (i / w) | 0;
    const inside = x >= 8 && x < 24 && y >= 8 && y < 24;
    if (inside) {
      assert.deepEqual([...out.subarray(o, o + 4)], [...px.subarray(o, o + 4)], `pixel ${x},${y} changed`);
    } else {
      assert.deepEqual([...out.subarray(o, o + 4)], [0, 0, 0, 0], `bg pixel ${x},${y} not cleared`);
    }
  }
});

test('pixel mode without connectivity removes interior green too (global exact match)', () => {
  const { w, h, px } = makeSprite();
  const s = settings('pixel', { pixel: { ...DEFAULT_SETTINGS.pixel, connected: false } });
  const out = processImage({ rgba: px, width: w, height: h, settings: s });
  assert.equal(out[(15 * w + 15) * 4 + 3], 0);
});

test('chroma mode keeps interior green when edge-connected, removes green screen', () => {
  const { w, h, px } = makeSprite();
  const s = settings('chroma', { chroma: { ...DEFAULT_SETTINGS.chroma, key: { r: 0, g: 255, b: 0 } } });
  const out = processImage({ rgba: px, width: w, height: h, settings: s });
  assert.equal(out[3], 0, 'corner removed');
  assert.equal(out[(15 * w + 15) * 4 + 3], 255, 'interior green kept');
  // skin pixel untouched (opaque interior is not despilled)
  const o = (12 * w + 12) * 4;
  assert.deepEqual([...out.subarray(o, o + 4)], [240, 190, 150, 255]);
  // no leftover green in any non-transparent pixel outside the subject
  for (let i = 0; i < w * h; i++) if (out[i * 4 + 3] === 0) assert.deepEqual([...out.subarray(i * 4, i * 4 + 3)], [0, 0, 0]);
});

test('protect layer blocks the flood and keeps marked areas', () => {
  const w = 10, h = 10;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { px[i * 4 + 1] = 255; px[i * 4 + 3] = 255; }
  const protect = new Uint8Array(w * h);
  protect[55] = 255;
  const out = processImage({ rgba: px, width: w, height: h, settings: settings('pixel'), protect });
  assert.equal(out[55 * 4 + 3], 255);
  assert.equal(out[0 * 4 + 3], 0);
});

test('white background illustration: white details inside are preserved', () => {
  const w = 20, h = 20;
  const px = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) {
    const o = (y * w + x) * 4;
    const edge = x === 5 || x === 14 || y === 5 || y === 14;
    px[o] = edge ? 0 : 255; px[o + 1] = edge ? 0 : 255; px[o + 2] = edge ? 0 : 255;
  }
  const s = settings('chroma', { chroma: { ...DEFAULT_SETTINGS.chroma, key: { r: 255, g: 255, b: 255 }, tolerance: 5, softness: 5 } });
  const out = processImage({ rgba: px, width: w, height: h, settings: s });
  assert.equal(out[3], 0);
  const o = (10 * w + 10) * 4;
  assert.deepEqual([...out.subarray(o, o + 4)], [255, 255, 255, 255], 'white eye inside outline kept');
});

test('soft chroma edges are decontaminated (no green fringe)', () => {
  const w = 3, h = 1;
  // bg green | 50% mix of red and green | red
  const px = new Uint8ClampedArray([0, 255, 0, 255, 128, 128, 0, 255, 255, 0, 0, 255]);
  const s = settings('chroma', { chroma: { ...DEFAULT_SETTINGS.chroma, key: { r: 0, g: 255, b: 0 }, hueSensitivity: 0, tolerance: 10, softness: 60 }, refine: { ...DEFAULT_REFINE.chroma, residueSize: 0 } });
  const out = processImage({ rgba: px, width: w, height: h, settings: s });
  assert.equal(out[3], 0);
  assert.ok(out[7] > 0 && out[7] < 255, 'mid pixel semi-transparent');
  assert.ok(out[5] < 60, `mid pixel green channel decontaminated (g=${out[5]})`);
  assert.deepEqual([...out.subarray(8, 12)], [255, 0, 0, 255]);
});

test('composite: restore brush returns original RGB, eraser clears', () => {
  const original = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
  const processed = new Uint8ClampedArray([0, 0, 0, 0, 40, 50, 60, 255]);
  const out = new Uint8ClampedArray(8);
  compositeRect({ original, processed, erase: new Uint8Array([0, 255]), protect: new Uint8Array([255, 0]) }, out, 2, 0, 0, 2, 1);
  assert.deepEqual([...out], [10, 20, 30, 255, 0, 0, 0, 0]);
});

test('border detection finds the green screen', () => {
  const { w, h, px } = makeSprite();
  const d = dominantBorderColor(px, w, h)!;
  assert.deepEqual(d.color, { r: 0, g: 255, b: 0 });
  assert.equal(analyzeImage(px, w, h).suggestedMode, 'pixel');
});

test('anti-aliased illustration is not mistaken for pixel art', () => {
  const w = 64, h = 64;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - 32, y - 32);
    const t = Math.min(1, Math.max(0, d - 20)); // 1px soft edge
    const o = (y * w + x) * 4;
    px[o] = 255 * t + 250 * (1 - t); px[o + 1] = 255 * t + 120 * (1 - t); px[o + 2] = 255 * t + 30 * (1 - t); px[o + 3] = 255;
  }
  const a = analyzeImage(px, w, h);
  assert.equal(a.isPixelArt, false);
  assert.equal(a.suggestedMode, 'chroma');
});

test('PNG and TIFF encoders are lossless and decode in Pillow with real alpha', async () => {
  const w = 37, h = 23;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < px.length; i++) px[i] = (i * 7919 + (i >> 3)) & 255;
  const dir = 'tests/.out';
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/raw.bin`, px);
  writeFileSync(`${dir}/t.png`, new Uint8Array(await (await encodePNG(px, w, h)).arrayBuffer()));
  writeFileSync(`${dir}/t.tif`, new Uint8Array(await encodeTIFF(px, w, h).arrayBuffer()));
  const py = `
import sys
from PIL import Image
raw=open('${dir}/raw.bin','rb').read()
for f in ['t.png','t.tif']:
    im=Image.open('${dir}/'+f); im.load()
    assert im.mode=='RGBA', (f, im.mode)
    assert im.size==(${w},${h}), im.size
    assert im.tobytes()==raw, f+' mismatch'
print('ok')`;
  assert.equal(execFileSync('python3', ['-c', py]).toString().trim(), 'ok');
});

test('color-difference matte: 65/35 skin+green edge pixel gets partial alpha and loses its green', () => {
  const skin = [225, 175, 140], key = [20, 185, 70];
  const mix = skin.map((v, i) => Math.round(v * 0.65 + key[i] * 0.35));
  const px = new Uint8ClampedArray([...key, 255, ...mix, 255, ...skin, 255]);
  const s = settings('chroma', { chroma: { ...DEFAULT_SETTINGS.chroma, key: { r: 20, g: 185, b: 70 } }, refine: { ...DEFAULT_REFINE.chroma, residueSize: 0 } });
  const out = processImage({ rgba: px, width: 3, height: 1, settings: s });
  assert.equal(out[3], 0);
  assert.ok(out[7] > 60 && out[7] < 255, `mixed alpha ${out[7]}`);
  assert.ok(out[5] < out[4], `mixed pixel no longer green-dominant: ${[...out.subarray(4, 8)]}`);
  assert.deepEqual([...out.subarray(8, 12)], [...skin, 255]);
});
