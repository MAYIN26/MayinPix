'use client';
import dynamic from 'next/dynamic';

const Studio = dynamic(() => import('@/components/Studio'), {
  ssr: false,
  loading: () => <div className="grid h-dvh place-items-center text-sm text-muted">PixelCut Studio…</div>,
});

export default function Page() {
  return <Studio />;
}
