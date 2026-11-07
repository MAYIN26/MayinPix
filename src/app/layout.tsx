import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PixelCut Studio — Background Remover',
  description: 'Remove green screens, solid colors and complex backgrounds locally in your browser. Lossless, full-resolution transparent PNG export.',
  icons: { icon: 'favicon.svg' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0e0f12' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
