/**
 * Everything that changes when this product is delivered under another name.
 *
 * WHY THIS EXISTS. The product name was written out in six places that nothing
 * kept in step: the installed application's name and short name, the browser
 * tab's title, the offline page's heading and its own `<title>`, and
 * `common.appName` in each of the two dictionaries. The navy was in three
 * more. Renaming meant finding all of them, and the one that was missed was
 * always the one nobody looks at until it is wrong — a taskbar shortcut
 * installed under the old name, which the operating system then keeps for
 * ever.
 *
 * Handing the same system to a second client is not a special case here; it
 * is the normal case. So the brand is configuration, and the places that use
 * it read it rather than repeat it.
 *
 * THE LATIN FORM IS NOT TRANSLATED, deliberately. `name` is what the
 * operating system installs under: the manifest is read once, before any
 * language handling has run, and a shortcut cannot be renamed later by
 * changing the interface language. `nameAr` is the wordmark drawn inside the
 * application, where the language IS known. `tagline` is a sentence rather
 * than a name, so it stays in the dictionaries with the rest of the prose.
 *
 * ONE FILE CANNOT REACH `public/offline.html`. It is served by the service
 * worker when the network is gone, so it is static HTML with no build step
 * and no imports (ADR-028). Its copy of the name is enforced instead:
 * `tests/brand.test.js` fails if it drifts from this file.
 *
 * The mark itself is not here. An SVG path in a config object is unreadable
 * and unreviewable; it lives in `components/layout/Logo.jsx`, which is the
 * one component to replace for a new mark.
 */
export const brand = {
  /**
   * The Latin form: the installed application's name, the browser tab, the
   * manifest. Latin even in an Arabic build, because an operating system
   * shortcut is made once at install time and cannot be renamed later by
   * changing the interface language.
   */
  name: 'Baydar',

  /**
   * The wordmark an Arabic interface draws instead. The product is named in
   * Arabic — بَيْدَر, the floor where a harvest is gathered, the grain
   * separated from the chaff, and the yield weighed and counted — so an
   * Arabic reader should meet it in its own script rather than transliterated
   * back at them.
   */
  nameAr: 'بيدر',

  /** Used where a launcher has little room. Same as `name` unless it is long. */
  shortName: 'Baydar',

  /**
   * One sentence, in English, for the install prompt and the page's meta
   * description. English even in Arabic builds, for the same reason the name
   * is not translated.
   */
  description: 'Operations and business intelligence for small trading businesses.',

  /**
   * The window chrome while the application loads, and the surface behind it.
   * Navy matches the sidebar, so an install opens looking like itself rather
   * than flashing white. Kept in step with `--brand-panel` in globals.css.
   */
  themeColor: '#0f2a47',
  backgroundColor: '#f5f7fb',
};
