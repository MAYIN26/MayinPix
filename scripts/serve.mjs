/**
 * Zero-dependency static server for the exported app (./out).
 * Sends COOP/COEP headers so ONNX Runtime can use multi-threaded WebAssembly.
 *   node scripts/serve.mjs [port]
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)), 'out');
const port = Number(process.argv[2] || process.env.PORT || 3000);
const base = (process.env.BASE_PATH || '').replace(/\/$/, '');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain', '.woff2': 'font/woff2',
};

createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (base) {
    if (path === base) { res.writeHead(301, { Location: base + '/' }).end(); return; }
    if (!path.startsWith(base + '/')) { res.writeHead(404).end('Not found'); return; }
    path = path.slice(base.length);
  }
  path = normalize(path).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path);
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
  } catch {
    try { statSync(file + '.html'); file += '.html'; } catch { file = join(root, '404.html'); res.statusCode = 404; }
  }
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  let size;
  try { size = statSync(file).size; } catch { res.writeHead(404).end('Not found'); return; }
  res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  res.setHeader('Content-Length', size);
  // NO_ISOLATION=1 emulates hosts that can't send these headers (e.g. GitHub Pages): WASM then runs single-threaded
  if (!process.env.NO_ISOLATION) {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  }
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`MayinPix → http://localhost:${port}${base}/`));
