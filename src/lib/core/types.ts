export type Mode = 'ai' | 'chroma' | 'pixel';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Chroma-key (green screen / solid color) parameters. Percent values are 0..100. */
export interface ChromaParams {
  key: RGB;
  /** Distance below which a pixel is fully removed. */
  tolerance: number;
  /** 0 = pure RGB distance, 100 = pure hue distance (chromatic keys only). */
  hueSensitivity: number;
  /** Pixels whose chroma is below this are never keyed (protects greys/whites when keying a colored screen). */
  satThreshold: number;
  /** Width of the soft transition band above tolerance. */
  softness: number;
  /** Only remove keyed regions connected to the image border (protects identical colors inside the subject). */
  edgeConnected: boolean;
  /** Color-difference matte for colored keys: mixed edge pixels get partial alpha proportional to how much screen color they contain. */
  matte: boolean;
}

export interface PixelParams {
  keys: RGB[];
  /** Exact match (zero tolerance). */
  exact: boolean;
  /** Integer RGB euclidean distance 0..441 used when exact = false. */
  distance: number;
  /** Only remove regions connected to the border. */
  connected: boolean;
  /** Use 8-connectivity for the flood fill. */
  diagonal: boolean;
}

export interface AiParams {
  model: string;
  /** Guided-filter edge refinement using the original image as guide. */
  smartEdges: boolean;
  /** Guided filter radius in pixels relative to a 1024px image. */
  edgeRadius: number;
}

export interface RefineParams {
  /** Alpha below this becomes 0. */
  alphaLow: number;
  /** Alpha at or above this becomes 255 (preserves original RGB). */
  alphaHigh: number;
  /** Negative = erode (shrink), positive = expand, in pixels. */
  shift: number;
  /** Edge softness / feather radius in pixels. */
  feather: number;
  invert: boolean;
  /** Remove isolated opaque islands smaller than this many pixels. */
  residueSize: number;
  /** Fill transparent holes inside the subject smaller than this many pixels. */
  holeSize: number;
  /** Color spill suppression 0..100. */
  spill: number;
  spillScope: 'edges' | 'all';
  /** Un-mix the background color out of semi-transparent edge pixels. */
  decontaminate: boolean;
}

export interface Settings {
  mode: Mode;
  chroma: ChromaParams;
  pixel: PixelParams;
  ai: AiParams;
  refine: RefineParams;
}

export const DEFAULT_REFINE: Record<Mode, RefineParams> = {
  ai: { alphaLow: 12, alphaHigh: 235, shift: 0, feather: 0, invert: false, residueSize: 64, holeSize: 0, spill: 0, spillScope: 'edges', decontaminate: true },
  chroma: { alphaLow: 0, alphaHigh: 255, shift: 0, feather: 0, invert: false, residueSize: 16, holeSize: 0, spill: 60, spillScope: 'edges', decontaminate: true },
  pixel: { alphaLow: 0, alphaHigh: 255, shift: 0, feather: 0, invert: false, residueSize: 0, holeSize: 0, spill: 0, spillScope: 'edges', decontaminate: false },
};

export const DEFAULT_SETTINGS: Settings = {
  mode: 'chroma',
  chroma: { key: { r: 0, g: 177, b: 64 }, tolerance: 22, hueSensitivity: 60, satThreshold: 12, softness: 10, edgeConnected: true, matte: true },
  pixel: { keys: [{ r: 0, g: 255, b: 0 }], exact: true, distance: 0, connected: true, diagonal: false },
  ai: { model: 'isnet-quint8', smartEdges: true, edgeRadius: 6 },
  refine: DEFAULT_REFINE.chroma,
};
