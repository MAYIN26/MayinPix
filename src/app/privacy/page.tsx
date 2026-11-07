'use client';
import dynamic from 'next/dynamic';

const PrivacyPage = dynamic(() => import('@/components/PrivacyPage'), { ssr: false });

export default function Page() {
  return <PrivacyPage />;
}
