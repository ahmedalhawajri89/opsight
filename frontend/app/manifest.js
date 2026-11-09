/**
 * The installed application (ADR-036).
 *
 * `display: 'standalone'` is what makes a desktop install open in its own
 * window with no address bar — the thing a reader asked for when they said
 * it should feel like an application rather than a page.
 *
 * `start_url` is the dashboard rather than `/`: someone who installed this
 * wants their figures, not the marketing redirect. An unauthenticated visit
 * is sent to sign-in by the layout anyway, so it is safe for a signed-out
 * install too.
 *
 * NOT TRANSLATED, deliberately. The manifest is read once at install time,
 * before any of this application's own language handling has run, and the
 * name it is installed under then sits in the taskbar for ever — changing
 * the interface language later cannot rename a shortcut the operating
 * system already made. A product name that is the same in both languages is
 * the honest answer; the description is in English for the same reason.
 *
 * The name, the description and the two colours come from brand.config.js,
 * because an install under a stale name is the one rename mistake an
 * operating system makes permanent.
 */
import { brand } from '@/brand.config';

export default function manifest() {
  return {
    name: brand.name,
    short_name: brand.shortName,
    description: brand.description,
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',

    /*
     * The window chrome's colour while the application loads, and the
     * surface behind it. Navy matches the sidebar, so an install opens
     * looking like itself rather than flashing white.
     */
    theme_color: brand.themeColor,
    background_color: brand.backgroundColor,

    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      /*
       * Separate drawing, not the same file tagged twice. A platform crops a
       * maskable icon to its own shape, so this one has the mark inside the
       * safe zone and the colour running to the edge; using the `any` icon
       * here would lose its corners to the crop.
       */
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
