export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  /** Relative URLs are served by this app (fully local). */
  url: string;
  sizeMB: number;
  inputSize: number;
  /** Input normalization: (pixel - mean) / std */
  mean: number;
  std: number;
  /** Apply min-max normalization to the raw output. */
  normalizeOutput: boolean;
  remote: boolean;
  license: string;
}

export const MODELS: ModelInfo[] = [
  {
    id: 'isnet-quint8',
    name: 'ISNet · fast (local)',
    description: 'General-purpose subject segmentation (people, animals, products, illustrations). 8-bit quantized, runs in your browser.',
    url: 'models/isnet-quint8.onnx',
    sizeMB: 44,
    inputSize: 1024,
    mean: 128,
    std: 256,
    normalizeOutput: false,
    remote: false,
    license: 'Weights: IMG.LY background-removal-data (AGPL-3.0)',
  },
  {
    id: 'isnet-fp16',
    name: 'ISNet · high quality (local)',
    description: 'Half-precision variant with finer edges. Install with `npm run prepare-assets -- --with-fp16`.',
    url: 'models/isnet-fp16.onnx',
    sizeMB: 88,
    inputSize: 1024,
    mean: 128,
    std: 256,
    normalizeOutput: false,
    remote: false,
    license: 'Weights: IMG.LY background-removal-data (AGPL-3.0)',
  },
  {
    id: 'rmbg-1.4',
    name: 'BRIA RMBG-1.4 (downloads weights)',
    description: 'Strong general model. Weights (~44 MB) are downloaded once from Hugging Face; your images still never leave the device.',
    url: 'https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model_quantized.onnx',
    sizeMB: 44,
    inputSize: 1024,
    mean: 127.5,
    std: 255,
    normalizeOutput: true,
    remote: true,
    license: 'BRIA RMBG-1.4 license (non-commercial use)',
  },
];

export const CUSTOM_MODEL_ID = 'custom';

export function getModel(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}
