'use client';
import { Fragment } from 'react';
import { X, HelpCircle } from 'lucide-react';
import { useStudio } from '@/store/studio';
import { useT } from '@/i18n';
import { HELP } from '@/i18n/help';

/** Renders `**bold**` segments. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) => (i % 2 ? <b key={i} className="text-fg">{part}</b> : <Fragment key={i}>{part}</Fragment>))}
    </>
  );
}

export default function HelpDialog() {
  const set = useStudio((s) => s.set);
  const lang = useStudio((s) => s.lang);
  const t = useT();
  const help = HELP[lang];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-label={help.title} onClick={() => set({ helpOpen: false })}>
      <div className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 flex items-center gap-2 border-b border-line bg-panel px-6 py-4">
          <HelpCircle size={16} className="text-accent" />
          <h2 className="text-sm font-semibold">{help.title}</h2>
          <button type="button" aria-label={t('common.close')} className="ml-auto text-muted hover:text-fg" onClick={() => set({ helpOpen: false })}><X size={16} /></button>
        </header>
        <div className="space-y-5 px-6 py-5 text-[13px] leading-relaxed text-muted">
          {help.sections.map((s) => (
            <section key={s.h}>
              <h3 className="mb-1 font-semibold text-fg">{s.h}</h3>
              {s.items && (
                <ul className="list-disc space-y-1 pl-5">
                  {s.items.map((it) => <li key={it}><Rich text={it} /></li>)}
                </ul>
              )}
              {s.p?.map((p) => <p key={p} className={s.items ? 'mt-2' : ''}><Rich text={p} /></p>)}
            </section>
          ))}
          <section>
            <h3 className="mb-2 font-semibold text-fg">{help.shortcutsTitle}</h3>
            <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {help.shortcuts.map(([k, d]) => (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <kbd className="min-w-[96px] rounded-md border border-line bg-raised px-1.5 py-0.5 text-center font-mono text-[11px] text-fg">{k}</kbd>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
