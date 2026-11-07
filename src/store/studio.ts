'use client';
import { create } from 'zustand';
import { DEFAULT_REFINE, DEFAULT_SETTINGS, type Mode, type Settings } from '@/lib/core/types';
import type { Analysis } from '@/lib/core/detect';
import type { ExportFormat } from '@/lib/exporter';

export type Lang = 'en' | 'es' | 'pt' | 'fr';

export type Section = 'upload' | 'ai' | 'chroma' | 'pixel' | 'manual' | 'refine' | 'export';
export type Tool = 'pan' | 'erase' | 'restore' | 'eyedropper';
export type EyedropTarget = 'chroma' | 'pixel' | 'pixel-add' | 'preview-bg' | 'export-bg';
export type ViewMode = 'result' | 'original' | 'split' | 'side' | 'mask';
export type PreviewBg = 'checker' | 'black' | 'white' | 'custom' | 'image';

export interface DocInfo {
  id: number;
  name: string;
  size: number;
  format: string;
  width: number;
  height: number;
  thumb: string;
  notes: string[];
  analysis: Analysis;
}

export interface RecentItem {
  id: number;
  name: string;
  thumb: string;
  file: File;
}

export interface ExportState {
  format: ExportFormat;
  sizeMode: 'original' | 'scale' | 'custom';
  scale: number;
  width: number;
  height: number;
  lockRatio: boolean;
  resample: 'nearest' | 'smooth';
  background: 'transparent' | 'color' | 'image';
  bgColor: string;
  quality: number;
  filename: string;
  pngFilter: 'adaptive' | 'none';
  preset: 'none' | 'sprite' | 'illustration' | 'photo';
  /** Background was switched to a color only because JPG has no alpha. */
  bgForced: boolean;
}

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  text: string;
}

export interface StudioState {
  doc: DocInfo | null;
  recent: RecentItem[];
  settings: Settings;
  section: Section;
  page: 'remover' | 'editor';
  tool: Tool;
  eyedropTarget: EyedropTarget;
  brush: { size: number; hardness: number };
  view: {
    mode: ViewMode;
    bg: PreviewBg;
    custom: string;
    overlay: boolean;
    overlayOpacity: number;
    split: number;
    zoom: number;
    loupe: boolean;
  };
  exportOpts: ExportState;
  bgImage: { name: string; url: string } | null;
  loading: { active: boolean; stage: string; progress: number | null };
  processing: { active: boolean; stage: string; ms: number | null };
  ai: { status: 'idle' | 'loading' | 'running' | 'ready' | 'error'; stage: string; progress: number | null; backend: string; ms: number | null; error: string | null; customName: string | null };
  history: { canUndo: boolean; canRedo: boolean };
  exporting: boolean;
  toasts: Toast[];
  theme: 'dark' | 'light';
  lang: Lang;
  helpOpen: boolean;
  batchOpen: boolean;
  mobilePanel: boolean;
  tick: number;

  set: (p: Partial<StudioState>) => void;
  setSettings: (fn: (s: Settings) => Settings) => void;
  setMode: (m: Mode) => void;
  setView: (p: Partial<StudioState['view']>) => void;
  setExport: (p: Partial<ExportState>) => void;
  toast: (kind: Toast['kind'], text: string) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

/** Saved preferences (the store is only created in the browser: the studio is loaded with ssr: false). */
function saved<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

export const useStudio = create<StudioState>((set, get) => ({
  doc: null,
  recent: [],
  settings: DEFAULT_SETTINGS,
  section: 'upload',
  page: 'remover',
  tool: 'pan',
  eyedropTarget: 'chroma',
  brush: { size: 40, hardness: 80 },
  view: { mode: 'result', bg: 'checker', custom: '#3b82f6', overlay: false, overlayOpacity: 55, split: 0.5, zoom: 1, loupe: true },
  exportOpts: {
    format: 'png', sizeMode: 'original', scale: 2, width: 0, height: 0, lockRatio: true, resample: 'smooth',
    background: 'transparent', bgColor: '#ffffff', quality: 0.95, filename: 'image-nobg', pngFilter: 'adaptive', preset: 'none', bgForced: false,
  },
  bgImage: null,
  loading: { active: false, stage: '', progress: null },
  processing: { active: false, stage: '', ms: null },
  ai: { status: 'idle', stage: '', progress: null, backend: '', ms: null, error: null, customName: null },
  history: { canUndo: false, canRedo: false },
  exporting: false,
  toasts: [],
  theme: saved('pixelcut-theme', ['dark', 'light'] as const, 'dark'),
  lang: saved('pixelcut-lang', ['en', 'es', 'pt', 'fr'] as const, 'en'),
  helpOpen: false,
  batchOpen: false,
  mobilePanel: false,
  tick: 0,

  set: (p) => set(p),
  setSettings: (fn) => set({ settings: fn(get().settings) }),
  setMode: (mode) => {
    const s = get().settings;
    if (s.mode === mode) return;
    set({
      settings: { ...s, mode, refine: DEFAULT_REFINE[mode] },
      section: mode,
      exportOpts: { ...get().exportOpts, resample: mode === 'pixel' ? 'nearest' : get().exportOpts.resample },
    });
  },
  setView: (p) => set({ view: { ...get().view, ...p } }),
  setExport: (p) => set({ exportOpts: { ...get().exportOpts, ...p } }),
  toast: (kind, text) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, kind, text }] });
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 3500);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
