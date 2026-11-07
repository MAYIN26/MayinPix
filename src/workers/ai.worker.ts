/// <reference lib="webworker" />
import type * as Ort from 'onnxruntime-web';
import { resizeMask } from '../lib/core/morph';

/**
 * Real on-device segmentation with ONNX Runtime Web. The model sees a 1024×1024 copy of the
 * image; its soft mask is upscaled (bilinear) to the ORIGINAL resolution and returned.
 * The original pixels are never modified here.
 */

declare const self: DedicatedWorkerGlobalScope;

export interface AiRunRequest {
  type: 'run';
  id: number;
  assetBase: string;
  model: { id: string; url: string; inputSize: number; mean: number; std: number; normalizeOutput: boolean };
  customModel?: ArrayBuffer;
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

let ort: typeof Ort | null = null;
const sessions = new Map<string, Ort.InferenceSession>();
let backend = 'wasm';

function post(msg: unknown, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer);
}

async function loadOrt(assetBase: string) {
  if (ort) return ort;
  const url = new URL('ort/ort.all.min.mjs', assetBase).href;
  ort = (await import(/* webpackIgnore: true */ url)) as typeof Ort;
  ort.env.wasm.wasmPaths = new URL('ort/', assetBase).href;
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
  return ort;
}

async function fetchWithProgress(url: string, id: number): Promise<ArrayBuffer> {
  const cacheName = 'pixelcut-models-v1';
  let cache: Cache | null = null;
  try {
    cache = await caches.open(cacheName);
    const hit = await cache.match(url);
    if (hit) {
      post({ type: 'progress', id, stage: 'stage.cached', progress: 1 });
      return await hit.arrayBuffer();
    }
  } catch {
    cache = null; // Cache Storage unavailable (e.g. insecure context)
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model download failed (${res.status} ${res.statusText}) — ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  let last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    const now = performance.now();
    if (now - last > 100) {
      last = now;
      post({ type: 'progress', id, stage: 'stage.download', progress: total ? loaded / total : 0, loaded, total });
    }
  }
  const buf = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  if (cache) {
    try {
      await cache.put(url, new Response(buf.slice().buffer, { headers: { 'content-type': 'application/octet-stream' } }));
    } catch {
      /* quota exceeded: ignore */
    }
  }
  return buf.buffer;
}

async function getSession(req: AiRunRequest): Promise<Ort.InferenceSession> {
  const o = await loadOrt(req.assetBase);
  const key = req.customModel ? `custom:${req.customModel.byteLength}` : req.model.id;
  const cached = sessions.get(key);
  if (cached) return cached;
  const bytes = req.customModel ?? (await fetchWithProgress(new URL(req.model.url, req.assetBase).href, req.id));
  post({ type: 'progress', id: req.id, stage: 'stage.init', progress: 1 });
  let session: Ort.InferenceSession | null = null;
  const gpu = (navigator as Navigator & { gpu?: unknown }).gpu;
  if (gpu) {
    try {
      session = await o.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ['webgpu'], graphOptimizationLevel: 'all' });
      backend = 'webgpu';
    } catch {
      session = null;
    }
  }
  if (!session) {
    session = await o.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    backend = 'wasm';
  }
  sessions.clear(); // keep only one model in memory
  sessions.set(key, session);
  return session;
}

async function run(req: AiRunRequest) {
  const { id, width: w, height: h, model } = req;
  const session = await getSession(req);
  const o = ort!;
  post({ type: 'progress', id, stage: 'stage.input', progress: 1 });
  const S = model.inputSize;
  // high-quality downscale for the model input only
  const bmp = await createImageBitmap(new ImageData(new Uint8ClampedArray(req.rgba), w, h));
  const canvas = new OffscreenCanvas(S, S);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, S, S);
  bmp.close();
  const px = ctx.getImageData(0, 0, S, S).data;
  const plane = S * S;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    input[i] = (px[i * 4] - model.mean) / model.std;
    input[plane + i] = (px[i * 4 + 1] - model.mean) / model.std;
    input[2 * plane + i] = (px[i * 4 + 2] - model.mean) / model.std;
  }
  post({ type: 'progress', id, stage: 'stage.running', backend: backend.toUpperCase(), progress: 1 });
  const t0 = performance.now();
  const feeds: Record<string, Ort.Tensor> = { [session.inputNames[0]]: new o.Tensor('float32', input, [1, 3, S, S]) };
  const results = await session.run(feeds);
  const outT = results[session.outputNames[0]];
  const dims = outT.dims;
  const oh = dims[dims.length - 2];
  const ow = dims[dims.length - 1];
  const raw = (await outT.getData()) as Float32Array;
  const m = new Float32Array(ow * oh);
  m.set(raw.subarray(0, ow * oh));
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < m.length; i++) {
    if (m[i] < mn) mn = m[i];
    if (m[i] > mx) mx = m[i];
  }
  if (model.normalizeOutput || mn < -0.01 || mx > 1.01) {
    const range = mx - mn || 1;
    for (let i = 0; i < m.length; i++) m[i] = (m[i] - mn) / range;
  }
  const inferenceMs = Math.round(performance.now() - t0);
  post({ type: 'progress', id, stage: 'stage.upscale', progress: 1 });
  const mask = resizeMask(m, ow, oh, w, h);
  post({ type: 'result', id, mask, backend, inferenceMs, modelSize: [ow, oh] }, [mask.buffer]);
}

self.onmessage = (e: MessageEvent<AiRunRequest>) => {
  const req = e.data;
  if (req.type !== 'run') return;
  run(req).catch((err: unknown) => post({ type: 'error', id: req.id, message: err instanceof Error ? err.message : String(err) }));
};
