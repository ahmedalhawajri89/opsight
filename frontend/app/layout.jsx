import { cookies } from 'next/headers';
import { Inter, JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';

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
 * The Arabic face: DIN Next LT Arabic, self-hosted from `app/fonts` and
 * converted to woff2 (about 50KB a weight, down from 157KB as TrueType).
 *
 * Three weights, because those are the three the system uses — the family also
 * ships UltraLight, Light, Heavy and Black, and every face listed here is a
 * face every visitor downloads.
 *
 * THE FAMILY HAS NO SEMIBOLD. Nothing between Medium and Bold exists, so a
 * heading asking for 600 resolves to Bold under the CSS font-matching rules
 * (for a weight above 500 the browser looks upward first). That is not a
 * fallback going wrong — it is the right answer: Arabic needs roughly one step
 * more weight than Latin to look equally present at the same size, so a
 * heading lands on SemiBold in Inter and Bold here, and the two read as equals.
 * `font-synthesis-weight: none` in globals.css keeps the browser from smearing
 * a fake 600 out of the Regular face, which in a cursive script breaks the
 * joins between letters.
 *
 * The stack lists Inter first, so Latin characters — SKUs, order references,
 * "BHD", every digit — render in Inter, and Arabic characters fall through to
 * DIN Next, per glyph, in the same line.
 */
const arabic = localFont({
  variable: '--font-arabic',
  display: 'swap',
  src: [
    { path: './fonts/DINNextLTArabic-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/DINNextLTArabic-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/DINNextLTArabic-Bold.woff2', weight: '700', style: 'normal' },
  ],
});

const mono = JetBrains_Mono({
  variable: '--font-mono-ui',
  subsets: ['latin'],
  display: 'swap',
});

/*
 * THE STACK — both real faces before either fallback.
 *
 * next/font hands each face over paired with a metric-matched fallback:
 * `'Inter', 'Inter Fallback'`. Chained as pairs — Inter's, then the Arabic
 * one — the stack read Inter → Inter Fallback → DIN Next, and Inter Fallback
 * is `local("Arial")`. Arial has Arabic glyphs, so every Arabic character was
 * claimed by Arial one step before the Arabic face was consulted: the Arabic
 * font downloaded on every page and drew nothing — IBM Plex before this, and
 * DIN Next until this fix. Chrome's own report
 * (CSS.getPlatformFontsForNode) said "ArialMT" for every Arabic heading, and
 * because Arial has no 600, every Arabic heading was also a weight too light.
 *
 * So the pairs are taken apart and re-ordered: each real face first, chosen per
 * glyph, then the fallbacks for the instant before those faces arrive. Built
 * from next/font's own values rather than typed out, so a renamed family
 * cannot silently reintroduce the bug — and e2e/i18n.spec.js asks Chrome which
 * font actually drew an Arabic heading.
 */
const [interFace, interFallback] = inter.style.fontFamily.split(', ');
const [arabicFace, arabicFallback] = arabic.style.fontFamily.split(', ');
const FONT_STACK = [interFace, arabicFace, interFallback, arabicFallback]
  .filter(Boolean)
  .join(', ');

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
      style={{ '--font-stack': FONT_STACK }}
    >
      <body className="min-h-full">
        <Providers initialLocale={locale} initialNumerals={numerals}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
