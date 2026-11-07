'use client';
import { Fragment, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useStudio } from '@/store/studio';
import { useT, LANGUAGES, isLang } from '@/i18n';
import { PRIVACY } from '@/i18n/privacy';
import { adsEnabled } from '@/lib/ads';

/** Renders `[text](url)` as links. */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
        return m ? <a key={i} href={m[2]} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">{m[1]}</a> : <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

export default function PrivacyPage() {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const theme = useStudio((s) => s.theme);
  const set = useStudio((s) => s.set);
  const c = PRIVACY[lang];
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang;
    document.title = `${c.title} — MayinPix`;
  }, [theme, lang, c.title]);
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-5 py-10 text-[14px] leading-relaxed text-muted">
      <div className="mb-8 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-1.5 text-xs text-muted hover:text-fg"><ArrowLeft size={14} /> {t('privacy.back')}</Link>
        <select
          aria-label={t('nav.language')}
          value={lang}
          onChange={(e) => { if (isLang(e.target.value)) { set({ lang: e.target.value }); try { localStorage.setItem('mayinpix-lang', e.target.value); } catch { /* ignore */ } } }}
          className="rounded-lg border border-line bg-panel px-2 py-1 text-xs text-fg"
        >
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>
      <h1 className="flex items-center gap-2 text-2xl font-semibold text-fg"><ShieldCheck size={22} className="text-accent" /> {c.title}</h1>
      <p className="mt-1 text-xs text-faint">{c.updated}</p>
      {c.sections.filter((s) => !s.adsOnly || adsEnabled).map((s) => (
        <section key={s.h} className="mt-7">
          <h2 className="mb-2 text-base font-semibold text-fg">{s.h}</h2>
          {s.p.map((p) => <p key={p} className="mt-2"><Linked text={p} /></p>)}
        </section>
      ))}
    </main>
  );
}
