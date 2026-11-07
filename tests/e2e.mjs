/**
 * End-to-end acceptance tests in a real Chromium against the exported build.
 *   npm run build && node tests/e2e.mjs
 */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 4321;
const BASE = `http://localhost:${PORT}/`;
const FIX = 'tests/fixtures';
const OUT = 'tests/.out/e2e';
mkdirSync(OUT, { recursive: true });

execFileSync('python3', ['tests/make_fixtures.py', FIX]);
const server = spawn('node', ['scripts/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch();
const results = [];
const py = (code) => execFileSync('python3', ['-c', code]).toString().trim();

async function openWith(file, { width = 1440, height = 900 } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console]', m.text()); });
  await page.goto(BASE);
  await page.locator('input[type=file]').first().setInputFiles(file);
  return page;
}
async function waitProcessed(page, timeout = 120_000) {
  await page.locator('footer', { hasText: / \d+ ms/ }).waitFor({ timeout });
}
async function download(page, name) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('footer button', { hasText: 'DOWNLOAD IMAGE' }).click()]);
  const path = join(OUT, name);
  await dl.saveAs(path);
  return { path, suggested: dl.suggestedFilename() };
}
async function check(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  const t0 = Date.now();
  try {
    await fn();
    results.push([name, 'PASS', Date.now() - t0]);
    console.log(`✔ ${name}`);
  } catch (e) {
    results.push([name, 'FAIL', Date.now() - t0, e.message]);
    console.log(`✘ ${name}\n   ${e.message.split('\n').join('\n   ')}`);
  }
}

await check('Test 1: pixel-art sprite on green → exact pixels, real alpha, original size', async () => {
  const page = await openWith(`${FIX}/sprite-green.png`);
  await waitProcessed(page);
  await page.getByText('Pixel-art sprite detected').waitFor();
  await page.screenshot({ path: `${OUT}/ui-sprite.png` });
  const { path, suggested } = await download(page, 'sprite.png');
  if (suggested !== 'sprite-green-nobg.png') throw new Error('filename ' + suggested);
  const r = py(`
from PIL import Image
src=Image.open('${FIX}/sprite-green.png').convert('RGBA'); out=Image.open('${path}')
assert out.mode=='RGBA', out.mode
assert out.size==src.size, out.size
S=src.load(); O=out.load(); w,h=src.size
removed=kept=0
for y in range(h):
  for x in range(w):
    s=S[x,y]; o=O[x,y]
    if o[3]==0:
      assert o[:3]==(0,0,0), ('rgb left in transparent px',x,y,o)
      removed+=1
    else:
      assert o==s, ('changed pixel',x,y,s,o)
      assert o[3]==255, ('semi alpha in pixel art',x,y,o)
      kept+=1
# opaque green only where enclosed by the sprite: the gem (16 px) + the gaps between the legs (16 px)
greens=sum(1 for y in range(h) for x in range(w) if O[x,y][3] and O[x,y][:3]==(0,255,0))
assert greens==32, greens
print(removed,kept,greens)`);
  console.log('   removed/kept/interior-green:', r);
  await page.close();
});

await check('Test 2: illustration on white → white eyes kept, colors unchanged', async () => {
  const page = await openWith(`${FIX}/illustration-white.png`);
  await waitProcessed(page);
  await page.screenshot({ path: `${OUT}/ui-illustration.png` });
  const { path } = await download(page, 'illustration.png');
  console.log('   ' + py(`
from PIL import Image
src=Image.open('${FIX}/illustration-white.png').convert('RGBA'); out=Image.open('${path}')
assert out.mode=='RGBA' and out.size==src.size
S=src.load(); O=out.load()
assert O[5,5][3]==0, O[5,5]
assert O[335,235]==S[335,235] and O[335,235][3]==255, ('eye', O[335,235])
assert O[400,150]==S[400,150], ('body', O[400,150], S[400,150])
# count opaque pixels whose RGB differs from source
diff=sum(1 for y in range(0,600) for x in range(0,800) if O[x,y][3]==255 and O[x,y][:3]!=S[x,y][:3])
assert diff==0, diff
white_left=sum(1 for y in range(600) for x in range(800) if O[x,y][3]>0 and O[x,y][:3]==(255,255,255) and not (290<x<510 and 210<y<300))
print('opaque-changed', diff, 'stray-white', white_left)`));
  await page.close();
});

await check('Test 4: green screen with same-green logo → logo protected, no spill on screen', async () => {
  const page = await openWith(`${FIX}/greenscreen.jpg`);
  await waitProcessed(page);
  await page.getByText('Solid background detected').waitFor();
  await page.screenshot({ path: `${OUT}/ui-greenscreen.png` });
  const { path } = await download(page, 'greenscreen.png');
  console.log('   ' + py(`
from PIL import Image
out=Image.open('${path}'); O=out.load(); w,h=out.size
assert out.size==(1200,900) and out.mode=='RGBA'
assert O[10,10][3]==0 and O[1190,450][3]==0
assert O[600,540][3]==255, ('logo removed', O[600,540])
assert O[600,700][3]==255, O[600,700]
greenish=sum(1 for y in range(0,h,2) for x in range(0,w,2) if O[x,y][3]>0 and O[x,y][1]>O[x,y][0]+60 and O[x,y][1]>O[x,y][2]+60 and not (555<x<645 and 495<y<585))
print('residual green fringe px (sampled):', greenish)
assert greenish < 40, greenish`));
  await page.close();
});

await check('Test 3: complex background → AI segmentation on device', async () => {
  // compose a product onto a busy background
  const p0 = await browser.newPage({ viewport: { width: 520, height: 520 } });
  await p0.goto('file://' + process.cwd() + '/tests/assets/product.svg');
  await p0.screenshot({ path: `${OUT}/hoodie.png`, omitBackground: true });
  await p0.close();
  py(`
from PIL import Image
bg=Image.open('${FIX}/complex-bg-base.png').convert('RGBA')
fg=Image.open('${OUT}/hoodie.png').convert('RGBA').resize((560,560))
bg.alpha_composite(fg,(232,140)); bg.convert('RGB').save('${OUT}/complex.jpg',quality=93)
fg_mask=Image.new('L',bg.size,0); fg_mask.paste(fg.getchannel('A'),(232,140)); fg_mask.save('${OUT}/complex-gt.png')`);
  const page = await openWith(`${OUT}/complex.jpg`);
  await page.getByText('Complex background').waitFor();
  await waitProcessed(page, 240_000);
  const backend = await page.locator('aside').getByText(/Mask ready/).textContent().catch(() => '');
  console.log('   ' + backend);
  await page.screenshot({ path: `${OUT}/ui-ai.png` });
  const { path } = await download(page, 'complex.png');
  console.log('   ' + py(`
from PIL import Image
import numpy as np
out=np.array(Image.open('${path}')); gt=np.array(Image.open('${OUT}/complex-gt.png'))>127
src=np.array(Image.open('${OUT}/complex.jpg').convert('RGB'))
a=out[...,3]>127
iou=(a&gt).sum()/max(1,(a|gt).sum())
opaque=out[...,3]==255
same=(out[opaque][:,:3]==src[opaque]).all()
print(f'IoU vs ground truth = {iou:.3f}; opaque pixels identical to source: {same}; size {out.shape[1]}x{out.shape[0]}')
assert out.shape[:2]==src.shape[:2]
assert iou>0.85, iou
assert same`));
  await page.close();
});

await check('Test 5: high-resolution 6000×4000 export keeps dimensions', async () => {
  const page = await openWith(`${FIX}/large-white.png`);
  await waitProcessed(page, 180_000);
  const { path } = await download(page, 'large.png');
  console.log('   ' + py(`
from PIL import Image
im=Image.open('${path}'); print(im.size, im.mode, im.getpixel((10,10)), im.getpixel((3000,2000)))
assert im.size==(6000,4000) and im.mode=='RGBA' and im.getpixel((10,10))[3]==0 and im.getpixel((3000,2000))==(30,90,200,255)`));
  await page.close();
});

await check('Test 6: manual edit + undo, WEBP/JPG/TIFF exports are real files', async () => {
  const page = await openWith(`${FIX}/sprite-green.png`);
  await waitProcessed(page);
  // erase a stroke across the sprite with the eraser, then check it changed, undo, and check it's restored
  await page.keyboard.press('e');
  const box = await page.locator('canvas[aria-label="Image workspace"]').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx - 60, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy, { steps: 10 });
  await page.mouse.up();
  const erased = await download(page, 'erased.png');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const undone = await download(page, 'undone.png');
  console.log('   ' + py(`
from PIL import Image
e=Image.open('${erased.path}'); u=Image.open('${undone.path}')
te=sum(1 for p in e.getdata() if p[3]==0); tu=sum(1 for p in u.getdata() if p[3]==0)
print('transparent px after erase', te, 'after undo', tu); assert te>tu`));
  for (const [fmt, label] of [['WEBP', 'webp'], ['JPG', 'jpg'], ['TIFF', 'tif']]) {
    await page.locator('aside button', { hasText: new RegExp(`^${fmt}$`) }).first().click();
    const d = await download(page, `sprite.${label}`);
    console.log('   ' + py(`
from PIL import Image
im=Image.open('${d.path}'); im.load(); print('${fmt}', im.format, im.mode, im.size)
assert im.size==(48,48)
if '${fmt}'!='JPG': assert 'A' in im.mode and im.getpixel((0,0))[3]==0
else: assert im.getpixel((0,0))==(255,255,255)`));
  }
  await page.close();
});

await check('UI: comparison slider, mask view, mobile layout, light theme render', async () => {
  const page = await openWith(`${FIX}/greenscreen.jpg`);
  await waitProcessed(page);
  await page.keyboard.press('b');
  await page.screenshot({ path: `${OUT}/ui-split.png` });
  await page.keyboard.press('m');
  await page.screenshot({ path: `${OUT}/ui-mask.png` });
  await page.close();
  const m = await openWith(`${FIX}/sprite-green.png`, { width: 390, height: 844 });
  await waitProcessed(m);
  await m.screenshot({ path: `${OUT}/ui-mobile.png` });
  await m.close();
  const l = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await l.goto(BASE);
  await l.getByTitle('Switch to light theme').click();
  await l.waitForTimeout(400);
  await l.screenshot({ path: `${OUT}/ui-empty-light.png` });
  await l.close();
});

await check('Eyedropper, 4× nearest export, replacement background, batch ZIP', async () => {
  const page = await openWith(`${FIX}/greenscreen.jpg`);
  await waitProcessed(page);
  // eyedropper: pick the shirt color as key → shirt disappears
  await page.keyboard.press('i');
  const box = await page.locator('canvas[aria-label="Image workspace"]').boundingBox();
  const scale = await page.evaluate(() => {
    const e = window.__pixelcut; return { w: e.w, h: e.h };
  });
  // the image is centered and fit; click its point (600, 800) = blue shirt
  const fitScale = Math.min((box.width - 48) / scale.w, (box.height - 48) / scale.h);
  const ox = box.x + (box.width - scale.w * fitScale) / 2, oy = box.y + (box.height - scale.h * fitScale) / 2;
  await page.mouse.click(ox + 600 * fitScale, oy + 800 * fitScale);
  await page.getByText(/Picked #/).first().waitFor();
  const key = await page.evaluate(() => window.__pixelcut.store.settings.chroma.key);
  if (!(key.b > 120 && key.r < 80)) throw new Error('picked ' + JSON.stringify(key));
  await page.close();

  const sp = await openWith(`${FIX}/sprite-green.png`);
  await waitProcessed(sp);
  await sp.locator('aside button', { hasText: /^Scale$/ }).click();
  await sp.locator('aside button', { hasText: /^4×$/ }).click();
  const big = await download(sp, 'sprite4x.png');
  console.log('   ' + py(`
from PIL import Image
a=Image.open('${big.path}'); b=Image.open('${OUT}/sprite.png')
assert a.size==(192,192), a.size
assert a.resize((48,48),Image.NEAREST).tobytes()==b.tobytes()
assert len(set(a.getdata()))==len(set(b.getdata())), 'new colors invented'
print('4x nearest export exact, colors', len(set(a.getdata())))`));
  // replacement background color via export panel
  await sp.locator('aside button', { hasText: /^Original$/ }).click();
  await sp.locator('aside button', { hasText: /^Color$/ }).click();
  await sp.locator('aside button[title="#000000"]').click();
  const flat = await download(sp, 'sprite-black.png');
  console.log('   ' + py(`
from PIL import Image
im=Image.open('${flat.path}').convert('RGBA'); print('bg pixel', im.getpixel((0,0))); assert im.getpixel((0,0))==(0,0,0,255)`));
  // batch
  await sp.locator('aside button', { hasText: 'Upload' }).first().click().catch(() => {});
  await sp.locator('aside button', { hasText: 'Upload' }).first().click();
  await sp.getByText('Batch process multiple images').click();
  await sp.locator('input[type=file][multiple]').setInputFiles([`${FIX}/sprite-green.png`, `${FIX}/greenscreen.jpg`, `${FIX}/illustration-white.png`]);
  const [dl] = await Promise.all([sp.waitForEvent('download', { timeout: 120_000 }), sp.getByRole('button', { name: /Process 3 images/ }).click()]);
  await dl.saveAs(`${OUT}/batch.zip`);
  console.log('   ' + py(`
import zipfile, io
from PIL import Image
z=zipfile.ZipFile('${OUT}/batch.zip'); names=z.namelist(); print('zip:', names)
assert len(names)==3
for n in names:
  im=Image.open(io.BytesIO(z.read(n))); im.load(); assert im.mode in ('RGBA','RGB')`));
  await sp.close();
});

await check('Language switch: Español / Português / Français / English, persisted after reload', async () => {
  const page = await openWith(`${FIX}/greenscreen.jpg`);
  await waitProcessed(page);
  const expect = { es: ['DESCARGAR IMAGEN', 'Clave de color / pantalla verde', 'Cómo funciona PixelCut Studio'], pt: ['BAIXAR IMAGEM', 'Chroma key / tela verde', 'Como o PixelCut Studio funciona'], fr: ["TÉLÉCHARGER L'IMAGE", 'Incrustation / fond vert', 'Fonctionnement de PixelCut Studio'], en: ['DOWNLOAD IMAGE', 'Color key / green screen', 'How PixelCut Studio works'] };
  for (const [lang, [dl, panel, help]] of Object.entries(expect)) {
    await page.locator('header select').selectOption(lang);
    await page.locator('footer button', { hasText: dl }).waitFor({ timeout: 3000 });
    await page.locator('aside h3', { hasText: panel }).waitFor({ timeout: 3000 });
    const htmlLang = await page.evaluate(() => document.documentElement.lang);
    if (htmlLang !== lang) throw new Error('html lang ' + htmlLang);
    await page.keyboard.press('Escape');
    await page.locator('header nav button').nth(2).click();
    await page.getByRole('dialog').getByText(help).waitFor({ timeout: 3000 });
    if (lang === 'es') await page.screenshot({ path: `${OUT}/ui-es-help.png` });
    await page.keyboard.press('Escape');
    if (lang === 'fr') await page.screenshot({ path: `${OUT}/ui-fr.png` });
  }
  await page.locator('header select').selectOption('es');
  await page.reload();
  await page.getByText('Suelta una imagen para quitarle el fondo').waitFor({ timeout: 5000 });
  await page.locator('input[type=file]').first().setInputFiles(`${FIX}/sprite-green.png`);
  await page.getByText('Sprite de pixel art detectado').waitFor({ timeout: 10000 });
  await page.locator('footer', { hasText: / \d+ ms/ }).waitFor();
  await page.screenshot({ path: `${OUT}/ui-es.png` });
  const { suggested } = await (async () => {
    const [d] = await Promise.all([page.waitForEvent('download'), page.locator('footer button', { hasText: 'DESCARGAR IMAGEN' }).click()]);
    return { suggested: d.suggestedFilename() };
  })();
  if (suggested !== 'sprite-green-nobg.png') throw new Error(suggested);
  await page.getByText(/Guardado sprite-green-nobg.png/).waitFor({ timeout: 5000 });
  await page.close();
});

await browser.close();
server.kill();
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => r[1] !== 'PASS').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
