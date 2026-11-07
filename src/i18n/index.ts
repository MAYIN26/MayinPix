'use client';
import { useCallback } from 'react';
import { useStudio, type Lang } from '@/store/studio';
import { en, type Key } from './en';
import { es } from './es';
import { pt } from './pt';
import { fr } from './fr';

export type { Lang };
export type { Key };
export type Vars = Record<string, string | number>;

export const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'es', label: 'Español', flag: 'ES' },
  { code: 'pt', label: 'Português', flag: 'PT' },
  { code: 'fr', label: 'Français', flag: 'FR' },
];

const DICTS: Record<Lang, Record<Key, string>> = { en, es, pt, fr };

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'es' || v === 'pt' || v === 'fr';
}

export function translate(lang: Lang, key: Key, vars?: Vars): string {
  let s = DICTS[lang]?.[key] ?? en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return s;
}

/** Translate outside React (engine, toasts) using the current language. */
export function tr(key: Key, vars?: Vars): string {
  return translate(useStudio.getState().lang, key, vars);
}

/** React hook: re-renders the component when the language changes. */
export function useT() {
  const lang = useStudio((s) => s.lang);
  return useCallback((key: Key, vars?: Vars) => translate(lang, key, vars), [lang]);
}
