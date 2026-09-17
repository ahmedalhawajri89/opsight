/**
 * The languages Opsight speaks, and how each is laid out and formatted.
 *
 * Mirrors the server's Localizer: the same two languages and the same two
 * numbering systems, so the sentences the API writes and the labels this
 * client writes always agree on both.
 */

export const LOCALES = {
  en: { dir: 'ltr', intl: 'en-GB', nativeName: 'English' },
  ar: { dir: 'rtl', intl: 'ar-BH', nativeName: 'العربية' },
};

/** CLDR numbering-system names, passed straight into Intl. */
export const NUMERALS = ['latn', 'arab'];

export const DEFAULT_LOCALE = 'en';
export const DEFAULT_NUMERALS = 'latn';

/**
 * Remembers the last language on this browser, so the NEXT page load renders
 * in it from the very first byte — before the session has been checked and
 * the user's saved preference is known. The server reads it to set <html lang
 * dir>, which is what prevents a right-to-left page flashing left-to-right.
 *
 * It is a rendering hint, not the preference: the account's saved choice wins
 * the moment it arrives, and overwrites this.
 */
export const LOCALE_COOKIE = 'opsight_locale';
export const NUMERALS_COOKIE = 'opsight_numerals';

export function isLocale(value) {
  return Object.hasOwn(LOCALES, value);
}

export function normaliseLocale(value) {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function normaliseNumerals(locale, value) {
  // Western digits only mean anything to switch away from in Arabic; English
  // with Arabic-Indic digits is not an option the product offers.
  if (locale !== 'ar') return 'latn';

  return NUMERALS.includes(value) ? value : DEFAULT_NUMERALS;
}

/**
 * The BCP 47 tag every Intl formatter in the application receives.
 *
 * The numbering system travels as a Unicode extension (`-u-nu-arab`) rather
 * than as a separate option, so it applies uniformly to numbers, currency,
 * percentages AND dates without each call site having to remember it.
 */
export function intlTag(locale, numerals) {
  const base = LOCALES[normaliseLocale(locale)].intl;

  return locale === 'ar' ? `${base}-u-nu-${normaliseNumerals(locale, numerals)}` : base;
}

export function directionOf(locale) {
  return LOCALES[normaliseLocale(locale)].dir;
}
