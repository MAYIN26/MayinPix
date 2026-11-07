/// <reference lib="webworker" />
import { processImage } from '../lib/core/pipeline';
import type { Settings } from '../lib/core/types';
import { exportImage, type ExportOptions } from '../lib/exporter';
import { createZip } from '../lib/codecs/zip';

declare const self: DedicatedWorkerGlobalScope;

let src: { rgba: Uint8ClampedArray; w: number; h: number } | null = null;
let aiMask: Uint8Array | null = null;
let protect: Uint8Array | null = null;

type Msg =
  | { type: 'load'; rgba: Uint8ClampedArray; width: number; height: number }
  | { type: 'ai-mask'; mask: Uint8Array | null }
  | { type: 'protect'; layer: Uint8Array | null }
  | { type: 'process'; id: number; settings: Settings }
  | { type: 'export'; id: number; rgba: Uint8ClampedArray; width: number; height: number; options: ExportOptions }
  | { type: 'batch'; id: number; rgba: Uint8ClampedArray; width: number; height: number; settings: Settings; aiMask: Uint8Array | null; options: ExportOptions }
  | { type: 'zip'; id: number; files: { name: string; blob: Blob }[] };

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data;
  const id = 'id' in m ? m.id : -1;
  try {
    switch (m.type) {
      case 'load':
        src = { rgba: m.rgba, w: m.width, h: m.height };
        aiMask = null;
        protect = null;
        break;
      case 'ai-mask':
        aiMask = m.mask;
        break;
      case 'protect':
        protect = m.layer;
        break;
      case 'process': {
        if (!src) throw new Error('No image loaded');
        const t0 = performance.now();
        const out = processImage({
          rgba: src.rgba, width: src.w, height: src.h, settings: m.settings, aiMask, protect,
          onStage: (stage) => self.postMessage({ type: 'stage', id: m.id, stage }),
        });
        self.postMessage({ type: 'processed', id: m.id, rgba: out, ms: Math.round(performance.now() - t0) }, [out.buffer]);
        break;
      }
      case 'export': {
        const blob = await exportImage(m.rgba, m.width, m.height, m.options);
        self.postMessage({ type: 'exported', id: m.id, blob });
        break;
      }
      case 'batch': {
        const out = processImage({ rgba: m.rgba, width: m.width, height: m.height, settings: m.settings, aiMask: m.aiMask });
        const blob = await exportImage(out, m.width, m.height, m.options);
        self.postMessage({ type: 'exported', id: m.id, blob });
        break;
      }
      case 'zip': {
        const blob = await createZip(m.files);
        self.postMessage({ type: 'exported', id: m.id, blob });
        break;
      }
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
};
