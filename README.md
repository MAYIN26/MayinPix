# PixelCut Studio

A professional background remover that runs **entirely in the browser**. It removes green screens, solid colors (white, black, any color) and complex photo backgrounds, and exports **lossless, full-resolution transparent PNGs** without touching the subject's pixels.

> The subject is never redrawn or regenerated. Removal only changes alpha (and, when you enable them, edge decontamination / spill suppression on semi-transparent edge pixels). Every fully opaque pixel keeps its exact original RGB value.

## Quick start

```bash
git clone https://github.com/MAYIN26/pixelcut-studio.git
cd pixelcut-studio
npm install
npm run dev          # http://localhost:3000
```

Production (static export, deployable to any static host):

```bash
npm run build        # → ./out
npm start            # serves ./out with COOP/COEP headers (multi-threaded WASM) on :3000
```

`npm run dev` and `npm run build` first run `scripts/prepare-assets.mjs`, which copies ONNX Runtime Web into `public/ort/` and assembles the ISNet model into `public/models/` from the `@imgly/background-removal-data` package. This means the app needs no CDN and never uploads anything. Add the higher-quality fp16 model with `npm run prepare-assets -- --with-fp16`.

## Languages

The interface is available in **English** (default), **Español**, **Português** and **Français**. Use the language selector in the top bar; the choice is remembered in the browser. Translations live in `src/i18n/` (one file per language). TypeScript fails the build if a language is missing any key.

## Removal modes

| Mode | How it works |
| --- | --- |
| **AI removal** | Real on-device segmentation (ISNet, ONNX Runtime Web, WebGPU → WASM fallback) in a Web Worker. The model sees a 1024² copy; its soft mask is bilinearly upscaled to the original resolution, refined with an edge-aware **guided filter** against the full-resolution original, and applied to the original pixels. Optional models: ISNet fp16 (local), BRIA RMBG-1.4 (weights downloaded from Hugging Face, images stay local), or any custom `.onnx` with the same I/O. |
| **Color key** | Per-pixel distance to the key color mixing RGB and hue distance (hue sensitivity), saturation threshold, tolerance + softness, **color-difference edge matte** (mixed subject/screen pixels get true partial alpha), **edge-connected flood fill** so the same color inside the subject is protected, YCbCr **spill suppression** (keeps luminance) and **background decontamination** (un-mixes the local screen color from edge pixels). One-click presets for green, blue, white, black and red find the actual screen color in the image, plus auto-detection and an eyedropper. |
| **Pixel Art** | Exact-color (zero tolerance) or distance-limited matching, multiple key colors, 4/8-connected border flood, strictly binary alpha, no smoothing, no new colors, nearest-neighbor preview and nearest-neighbor export scaling. |

On upload the app analyses the image border and its anti-aliasing to pick a starting mode: sprite → Pixel Art, solid border → Color key, otherwise AI.

## Editing

* Eraser and **Restore** brushes (size in image pixels, hardness, 1-px hard brush for sprites). Restored pixels always use the original values, and in Color key / Pixel Art modes they also **block** the automatic flood from reaching them (manual foreground protection).
* Undo/redo for brush strokes *and* setting changes, reset edits, invert selection, restore/erase all.
* Edge refinement: alpha threshold & solid level, shrink/expand (O(n) morphology), feather, residue cleanup (removes small islands), hole filling, decontamination, spill suppression.
* Viewer: result / comparison slider / side-by-side / original / mask, red mask overlay with adjustable opacity, checkerboard / black / white / custom / replacement-image preview, wheel zoom, pinch zoom, pan (Space, middle mouse, hand tool), fit and 1:1, pixel grid at high zoom, and a **magnified pixel inspector** showing source and output RGBA plus transparency state.

## Export

* **PNG**: a built-in encoder (`src/lib/codecs/png.ts`) writes straight-alpha 8-bit RGBA with adaptive scanline filters and zlib from the Compression Streams API. Pixels never pass through a premultiplied canvas, so opaque pixels are bit-exact and transparent pixels are written as `0,0,0,0`: no green or white RGB is left behind, and no checkerboard is ever baked in.
* **WEBP** (with alpha), **JPG** (removed areas filled with a chosen color, since JPG has no transparency) and **TIFF** (uncompressed RGBA, unassociated alpha).
* Original resolution by default; optional scale (0.25×–8×) or custom size with nearest or smooth resampling. Optional solid-color or image background. Custom filename. Presets for game sprites, illustrations and photos.
* **Batch**: drop several files (or use *Upload → Batch*). Each file is processed with the current settings (per-image auto key in color modes) and the results download as a ZIP.

## Architecture

```
src/lib/core/      pure, framework-free image processing (unit tested in Node)
  keyers.ts        chroma key, color-difference matte, pixel-art keyer, border flood
  morph.ts         flood fill, O(n) erode/dilate, feather, components, guided filter, mask resize
  pipeline.ts      mode → alpha → refine → composite → decontaminate → despill
  composite.ts     manual eraser/restore layers over the automatic result
  detect.ts        dominant border color, pixel-art detection
src/lib/codecs/    PNG, TIFF, ZIP writers + CRC32
src/workers/       process.worker.ts (pipeline + export), ai.worker.ts (ONNX inference)
src/lib/engine.ts  main-thread document state, brushes, history, worker RPC, export
src/components/    Next.js / React UI (viewport canvas renderer, panels, dialogs)
```

Heavy work runs in Web Workers. Parameter changes are coalesced so only the latest settings are processed. Brush strokes recomposite only the dirty rectangle, and history stores only the affected region of each stroke.

## Tests

```bash
npm test              # unit tests: keying, pixel exactness, decontamination, PNG/TIFF round-trip via Pillow
npm run build && npm run test:e2e   # Chromium end-to-end acceptance tests (needs python3 + Pillow)
```

The end-to-end suite covers: a pixel-art sprite on green (every kept pixel identical, binary alpha, enclosed greens kept); a white-background illustration (white eyes kept, zero opaque pixels changed); a green screen with a same-green logo (logo protected, no fringe); AI segmentation of an object on a busy background; a 6000×4000 export; erase + undo; WEBP/JPG/TIFF; eyedropper; 4× nearest export; replacement background; and a batch ZIP.

## Honest limitations

* When subject and background share colors and touch, no automatic method separates them perfectly. Use the Restore brush (which also protects the area from color keying) or the Eraser.
* AI quality is bounded by the model's 1024 px input. Fine hair is improved by the guided filter but not perfect.
* Animated GIFs: only the first frame. Embedded color profiles are not converted: values are kept as stored and the PNG is written without a profile.
* WEBP encoding depends on browser support (Safari cannot encode WEBP; the app tells you and PNG still works).
* Max input 64 MP.

## Licenses

App code: © MAYIN26. ONNX Runtime Web: MIT. The bundled ISNet weights come from `@imgly/background-removal-data` (**AGPL-3.0**). If that does not fit your use, use RMBG-1.4 (BRIA license, non-commercial) or load your own ONNX model.
