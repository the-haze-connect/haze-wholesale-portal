import type { Metadata } from 'next';
import { Archivo, DM_Sans } from 'next/font/google';
import { Suspense } from 'react';
import { CartProvider } from '@/components/cart';
import { Header, PreviewStrip } from '@/components/chrome';
import './globals.css';

const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' });
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dmsans', display: 'swap' });

export const metadata: Metadata = {
  title: 'Haze Wholesale',
  description: 'Wholesale ordering for The Haze Connect and Totally Baked accounts.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${dmSans.variable}`}>
      <body>
        <CartProvider>
          <Suspense fallback={null}><PreviewStrip /></Suspense>
          <Suspense fallback={<header className="top" />}><Header /></Suspense>
          {children}
          <footer>
            <div className="wrap">
              <b>all fire. no filler.</b>
              <span>COAs for every batch · Wholesale accounts only</span>
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
