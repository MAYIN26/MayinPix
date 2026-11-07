import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ADS, adsEnabled } from '@/lib/ads';

const description =
  'Free background remover that runs in your browser: AI, green screen, solid colors and pixel art. Lossless transparent PNG at full resolution — your images never leave your device.';

export const metadata: Metadata = {
  title: 'MayinPix — Background Remover',
  description,
  applicationName: 'MayinPix',
  keywords: ['background remover', 'remove background', 'transparent png', 'green screen', 'chroma key', 'pixel art', 'quitar fondo'],
  openGraph: { title: 'MayinPix — Background Remover', description, type: 'website', siteName: 'MayinPix' },
  twitter: { card: 'summary', title: 'MayinPix — Background Remover', description },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0e0f12' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {adsEnabled && (
          // eslint-disable-next-line @next/next/no-sync-scripts
          <script async src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS.client}`} crossOrigin="anonymous" />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
