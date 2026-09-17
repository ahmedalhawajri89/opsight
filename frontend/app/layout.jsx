import { cookies } from 'next/headers';
import { IBM_Plex_Sans_Arabic, Inter, JetBrains_Mono } from 'next/font/google';

import { Providers } from './providers';
import {
  LOCALE_COOKIE,
  NUMERALS_COOKIE,
  directionOf,
  normaliseLocale,
  normaliseNumerals,
} from '@/lib/i18n/config';
import './globals.css';

// Self-hosted by next/font — no render-blocking request to a third party.
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

/*
 * The Arabic face. IBM Plex Sans Arabic was designed as a companion to a
 * neo-grotesque, so it sits beside Inter at matching weight and x-height
 * rather than looking like a fallback. The font stack lists Inter first: Latin
 * characters (SKUs, order references, "BHD") render in Inter, and Arabic
 * characters fall through to Plex — per glyph, in the same line.
 */
const arabic = IBM_Plex_Sans_Arabic({
  variable: '--font-arabic',
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
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

export default async function RootLayout({ children }) {
  /*
   * The language is decided HERE, on the server, from the cookie the client
   * last wrote — and `dir` is set in the very first byte of HTML.
   *
   * Setting it from JavaScript after hydration instead would paint every
   * Arabic page left-to-right for a frame and then flip it: the whole layout
   * visibly jumping sideways on every load. The signed-in user's saved
   * preference still wins once /me answers; this only makes the first paint
   * right in the overwhelmingly common case where it matches.
   */
  const store = await cookies();
  const locale = normaliseLocale(store.get(LOCALE_COOKIE)?.value);
  const numerals = normaliseNumerals(locale, store.get(NUMERALS_COOKIE)?.value);

  return (
    <html
      lang={locale}
      dir={directionOf(locale)}
      className={`${inter.variable} ${arabic.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Providers initialLocale={locale} initialNumerals={numerals}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
