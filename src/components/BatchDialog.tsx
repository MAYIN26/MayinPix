'use client';
import { useEffect, useRef, useState } from 'react';
import { Images, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useStudio } from '@/store/studio';
import { engine } from '@/lib/engine';
import { ACCEPT_ATTR, formatBytes } from '@/lib/decode';
import { useT, type Key } from '@/i18n';
import { Button, Note } from './ui';

/** Status codes sent by engine.batch: queued | decoding | ai | processing | done | error:<message> */
export default function BatchDialog() {
  const t = useT();
  const set = useStudio((s) => s.set);
  const mode = useStudio((s) => s.settings.mode);
  const format = useStudio((s) => s.exportOpts.format);
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onFiles = (e: Event) => {
      const list = (e as CustomEvent<File[]>).detail;
      setFiles(list);
      setStatus(list.map(() => 'queued'));
    };
    window.addEventListener('pixelcut-batch-files', onFiles);
    return () => window.removeEventListener('pixelcut-batch-files', onFiles);
  }, []);

  const start = async () => {
    setRunning(true);
    await engine.batch(files, (i, s) => setStatus((prev) => prev.map((v, j) => (j === i ? s : v))));
    setRunning(false);
  };

  const label = (s: string | undefined) => {
    if (!s) return '';
    if (s.startsWith('error:')) return t('batch.error', { msg: s.slice(6) });
    return t(`batch.${s}` as Key);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-label={t('batch.title')}>
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-2xl border border-line bg-panel shadow-2xl">
        <header className="flex items-center gap-2 border-b border-line px-5 py-4">
          <Images size={16} className="text-accent" />
          <h2 className="text-sm font-semibold">{t('batch.title')}</h2>
          <button type="button" aria-label={t('common.close')} className="ml-auto text-muted hover:text-fg disabled:opacity-40" disabled={running} onClick={() => set({ batchOpen: false })}><X size={16} /></button>
        </header>
        <div className="space-y-3 overflow-y-auto p-5">
          <Note>{t('batch.note', { mode: t(`mode.${mode}` as Key), format: format.toUpperCase() })}</Note>
          <Button className="w-full" disabled={running} onClick={() => input.current?.click()}>{t('batch.choose')}</Button>
          <input ref={input} type="file" multiple accept={ACCEPT_ATTR} hidden onChange={(e) => { const l = [...(e.target.files ?? [])]; setFiles(l); setStatus(l.map(() => 'queued')); e.target.value = ''; }} />
          {files.length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 px-3 py-2 text-xs">
                  {status[i] === 'done' ? <CheckCircle2 size={14} className="text-success" /> : status[i]?.startsWith('error:') ? <AlertCircle size={14} className="text-danger" /> : status[i] === 'queued' ? <span className="h-3.5 w-3.5 rounded-full border border-line-strong" /> : <Loader2 size={14} className="animate-spin text-accent" />}
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="shrink-0 text-faint">{formatBytes(f.size)}</span>
                  <span className="w-28 shrink-0 truncate text-right text-muted" title={label(status[i])}>{label(status[i])}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="ghost" disabled={running} onClick={() => set({ batchOpen: false })}>{t('common.close')}</Button>
          <Button variant="primary" disabled={!files.length || running} onClick={() => void start()}>
            {running ? <Loader2 size={14} className="animate-spin" /> : null} {t(files.length === 1 ? 'batch.processOne' : 'batch.processMany', { n: files.length || '' })}
          </Button>
        </footer>
      </div>
    </div>
  );
}
