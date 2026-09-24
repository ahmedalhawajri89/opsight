/**
 * The markets the setup wizard offers, and what each implies (ADR-024).
 *
 * These are STARTING POINTS the owner confirms or changes, never rules applied
 * behind their back: the wizard shows every one before it is saved. Weekends
 * and VAT rates are as the market study found them (docs/product/MARKET_STUDY.md
 * §4 and §5, September 2026). Tax rates change, which is why the wizard asks
 * the owner to check the rate rather than stating it as fact.
 *
 * Weekdays are ISO-numbered, as the API stores them: 1 = Monday … 7 = Sunday.
 * The list order mirrors the backend's Business::COUNTRIES.
 */
export const COUNTRIES = [
  {
    code: 'SA',
    currency: 'SAR',
    decimals: 2,
    timezone: 'Asia/Riyadh',
    weekStartsOn: 7,
    weekend: [5, 6],
    vatRate: 15,
  },
  {
    code: 'AE',
    currency: 'AED',
    decimals: 2,
    timezone: 'Asia/Dubai',
    weekStartsOn: 1,
    weekend: [6, 7],
    vatRate: 5,
  },
  {
    code: 'BH',
    currency: 'BHD',
    decimals: 3,
    timezone: 'Asia/Bahrain',
    weekStartsOn: 7,
    weekend: [5, 6],
    vatRate: 10,
  },
  {
    code: 'KW',
    currency: 'KWD',
    decimals: 3,
    timezone: 'Asia/Kuwait',
    weekStartsOn: 7,
    weekend: [5, 6],
    vatRate: null,
  },
  {
    code: 'OM',
    currency: 'OMR',
    decimals: 3,
    timezone: 'Asia/Muscat',
    weekStartsOn: 7,
    weekend: [5, 6],
    vatRate: 5,
  },
  {
    code: 'QA',
    currency: 'QAR',
    decimals: 2,
    timezone: 'Asia/Qatar',
    weekStartsOn: 7,
    weekend: [5, 6],
    vatRate: null,
  },
  {
    code: 'EG',
    currency: 'EGP',
    decimals: 2,
    timezone: 'Africa/Cairo',
    weekStartsOn: 7,
    weekend: [5, 6],
    vatRate: 14,
  },
  {
    code: 'JO',
    currency: 'JOD',
    decimals: 3,
    timezone: 'Asia/Amman',
    weekStartsOn: 7,
    weekend: [5, 6],
    vatRate: 16,
  },
  {
    code: 'MA',
    currency: 'MAD',
    decimals: 2,
    timezone: 'Africa/Casablanca',
    weekStartsOn: 1,
    weekend: [6, 7],
    vatRate: 20,
  },
];

export function countryPreset(code) {
  return COUNTRIES.find((country) => country.code === code) ?? null;
}

/** The settings a country implies, in the shape PATCH /settings takes. */
export function settingsFor(country) {
  return {
    currency: country.currency,
    currency_decimals: country.decimals,
    timezone: country.timezone,
    week_starts_on: country.weekStartsOn,
    weekend_days: country.weekend,
    vat_enabled: country.vatRate !== null,
    vat_rate: country.vatRate ?? 0,
    // Shelf prices in the region are normally shown with VAT included.
    prices_include_vat: country.vatRate !== null,
  };
}
