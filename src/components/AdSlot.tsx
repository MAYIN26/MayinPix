'use client';
import { useEffect, useRef } from 'react';
import { ADS, adsEnabled } from '@/lib/ads';
import { useT } from '@/i18n';
import { cx } from './ui';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * A clearly labelled Google AdSense unit. Renders nothing unless AdSense is configured
 * and a slot ID exists for this placement.
 */
export default function AdSlot({ slot, className, minHeight = 250 }: { slot: string; className?: string; minHeight?: number }) {
  const t = useT();
  const ref = useRef<HTMLModElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || el.getAttribute('data-adsbygoogle-status')) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* ad blocked or script unavailable: the app keeps working */
    }
  }, []);
  if (!adsEnabled || !slot) return null;
  return (
    <aside className={cx('rounded-2xl border border-line bg-panel-2/40 p-2', className)} aria-label={t('ads.label')}>
      <div className="mb-1 px-1 text-[10px] tracking-wide text-faint uppercase">{t('ads.label')}</div>
      <ins
        ref={ref}
        className="adsbygoogle"
        style={{ display: 'block', minHeight }}
        data-ad-client={ADS.client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
