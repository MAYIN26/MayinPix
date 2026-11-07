'use client';
import { X, HelpCircle } from 'lucide-react';
import { useStudio } from '@/store/studio';

const SHORTCUTS: [string, string][] = [
  ['E / R', 'Eraser / Restore brush'],
  ['H or hold Space', 'Pan'],
  ['I', 'Eyedropper (Shift+click adds a pixel-art key color)'],
  ['[ / ]', 'Brush size'],
  ['Wheel, + / -', 'Zoom'],
  ['0 / 1', 'Fit to screen / 100%'],
  ['B / M', 'Comparison slider / Mask view'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / Redo'],
  ['Ctrl+S', 'Download'],
  ['Ctrl+V', 'Paste image from clipboard'],
];

export default function HelpDialog() {
  const set = useStudio((s) => s.set);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-label="Help" onClick={() => set({ helpOpen: false })}>
      <div className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 flex items-center gap-2 border-b border-line bg-panel px-6 py-4">
          <HelpCircle size={16} className="text-accent" />
          <h2 className="text-sm font-semibold">How PixelCut Studio works</h2>
          <button type="button" aria-label="Close" className="ml-auto text-muted hover:text-fg" onClick={() => set({ helpOpen: false })}><X size={16} /></button>
        </header>
        <div className="space-y-5 px-6 py-5 text-[13px] leading-relaxed text-muted">
          <section>
            <h3 className="mb-1 font-semibold text-fg">1 · Choose a removal mode</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li><b className="text-fg">AI removal</b> — an ISNet segmentation model runs in your browser (WebGPU or WebAssembly). It predicts a soft mask at 1024 px, which is upscaled to full resolution and snapped to real edges with an edge-aware guided filter.</li>
              <li><b className="text-fg">Color key</b> — for green/blue screens and white, black or any solid backgrounds. Pick the color with the eyedropper, tune tolerance, softness, hue sensitivity and saturation threshold. <i>Protect subject interior</i> only removes regions connected to the border, so green inside the subject survives.</li>
              <li><b className="text-fg">Pixel Art</b> — exact-color (or distance-limited) removal with binary alpha, nearest-neighbor preview and no new colors. Add several keys for checkerboard-style backgrounds.</li>
            </ul>
            <p className="mt-2">The app picks a starting mode automatically by analysing the image border and color count.</p>
          </section>
          <section>
            <h3 className="mb-1 font-semibold text-fg">2 · Refine and fix</h3>
            <p>Use <b className="text-fg">Edges</b> for alpha thresholds, shrink/expand, feathering, residue cleanup, hole filling, color decontamination and spill suppression. Use the <b className="text-fg">Eraser</b> and <b className="text-fg">Restore</b> brushes for anything automatic removal can&apos;t decide. Restored pixels always use the original pixel values. The mask view, red overlay and pixel inspector show exactly which pixels are transparent.</p>
          </section>
          <section>
            <h3 className="mb-1 font-semibold text-fg">3 · Export</h3>
            <p>PNG export uses a built-in lossless encoder that writes straight (un-premultiplied) RGBA, so every opaque pixel keeps its exact original RGB value and transparent pixels are written as fully transparent (0,0,0,0) — no background color is left behind and no checkerboard is ever baked in. Images are exported at the original resolution unless you choose another size.</p>
          </section>
          <section>
            <h3 className="mb-1 font-semibold text-fg">Limits, honestly</h3>
            <p>When the subject and background share the same colors and touch each other, no automatic method can separate them perfectly. Use the Restore brush to protect those areas (it also stops color keying from spreading into them). Animated GIFs: only the first frame is processed. Color profiles are not converted; values are kept as stored.</p>
          </section>
          <section>
            <h3 className="mb-2 font-semibold text-fg">Keyboard shortcuts</h3>
            <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {SHORTCUTS.map(([k, d]) => (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <kbd className="min-w-[96px] rounded-md border border-line bg-raised px-1.5 py-0.5 text-center font-mono text-[11px] text-fg">{k}</kbd>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3 className="mb-1 font-semibold text-fg">Privacy</h3>
            <p>All decoding, AI inference and encoding happen locally. The default model is served by this app. Only if you select the optional RMBG-1.4 model are its weights downloaded from Hugging Face — your images are never uploaded.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
