/**
 * Copies ONNX Runtime Web binaries and the ISNet background-removal model into /public so the
 * app runs 100% locally (no CDN, no image uploads). Run automatically before dev/build.
 *   node scripts/prepare-assets.mjs [--with-fp16]
 */
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const nm = join(root, 'node_modules');

// 1. ONNX Runtime Web
const ortSrc = join(nm, 'onnxruntime-web', 'dist');
const ortDst = join(pub, 'ort');
mkdirSync(ortDst, { recursive: true });
for (const f of readdirSync(ortSrc)) {
  if (/^ort\.all\.min\.mjs$|^ort-wasm-simd-threaded(\.jsep)?\.(mjs|wasm)$/.test(f)) {
    const dst = join(ortDst, f);
    if (!existsSync(dst) || statSync(dst).size !== statSync(join(ortSrc, f)).size) copyFileSync(join(ortSrc, f), dst);
  }
}
console.log('[assets] onnxruntime-web ready in public/ort');

// 2. ISNet model weights (from @imgly/background-removal-data, AGPL-3.0)
const dataDir = join(nm, '@imgly', 'background-removal-data', 'dist');
const models = [['/models/small', 'isnet-quint8.onnx']];
if (process.argv.includes('--with-fp16') || process.env.PIXELCUT_FP16) models.push(['/models/medium', 'isnet-fp16.onnx']);
const modelDst = join(pub, 'models');
mkdirSync(modelDst, { recursive: true });
if (!existsSync(join(dataDir, 'resources.json'))) {
  console.warn('[assets] @imgly/background-removal-data not installed: AI mode will only offer remote / custom models.');
} else {
  const res = JSON.parse(readFileSync(join(dataDir, 'resources.json'), 'utf8'));
  for (const [key, name] of models) {
    const entry = res[key];
    const out = join(modelDst, name);
    if (existsSync(out) && statSync(out).size === entry.size) continue;
    const buf = Buffer.concat(entry.chunks.map((c) => readFileSync(join(dataDir, c.hash))));
    if (buf.length !== entry.size) throw new Error(`model ${key}: size mismatch`);
    writeFileSync(out, buf);
    console.log(`[assets] wrote public/models/${name} (${(buf.length / 1e6).toFixed(1)} MB)`);
  }
}
const available = readdirSync(modelDst).filter((f) => f.endsWith('.onnx'));
writeFileSync(join(modelDst, 'manifest.json'), JSON.stringify({ available }, null, 2));
