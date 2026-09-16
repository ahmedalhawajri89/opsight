import { Inter, JetBrains_Mono } from 'next/font/google';

import { Providers } from './providers';
import './globals.css';

// Self-hosted by next/font — no render-blocking request to a third party.
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const mono = JetBrains_Mono({
  variable: '--font-mono-ui',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  title: 'Opsight',
  description: 'Operations & Business Intelligence',
};

export default function RootLayout({ children }) {
  return (
    // `dir` is set here and nowhere else, so Phase 07 flips one attribute.
    // Components use logical properties (ms-/me-/ps-/pe-) and must survive
    // dir="rtl" without a stylesheet change (UI_UX_DIRECTION.md §10).
    <html lang="en" dir="ltr" className={`${inter.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
