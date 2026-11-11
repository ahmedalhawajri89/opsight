import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { brand } from '@/brand.config';
import ar from '@/lib/i18n/messages/ar';
import en from '@/lib/i18n/messages/en';

/*
|--------------------------------------------------------------------------
| One brand, one source
|--------------------------------------------------------------------------
|
| Handing this system to a second client under a second name is the normal
| case, not a special one. brand.config.js is where that name lives, and
| these tests are what stop a copy of it surviving somewhere else.
|
| The offline page is the reason this file exists at all: it is static HTML
| served by the service worker when the network is gone, so it cannot import
| anything (ADR-036). It is the one place a rename has to be made by hand —
| and the one place nobody looks until it is already wrong.
|
*/

const root = process.cwd();
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

/** Every message in a dictionary, keyed by its dotted path. */
function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') out[path] = value;
    else if (value && typeof value === 'object') flatten(value, path, out);
  }

  return out;
}

describe('the brand', () => {
  it('gives each language the wordmark it should draw', () => {
    /*
     * Not one string for both. The Latin form is what an operating system
     * installs under and cannot translate later; the Arabic form is what a
     * reader meets inside the application, in their own script rather than
     * transliterated back at them. Both come from the config, so neither can
     * drift on its own.
     */
    expect(en.common.appName).toBe(brand.name);
    expect(ar.common.appName).toBe(brand.nameAr);
    expect(brand.nameAr).not.toBe(brand.name);
  });

  it('leaves no Latin wordmark stranded in an Arabic sentence', () => {
    /*
     * The rename put "Baydar" inside thirteen Arabic sentences — "جديد على
     * Baydar؟" — because a find and replace does not know which script it is
     * standing in. An Arabic reader should meet the product in their own
     * script, and an English one in theirs; this is what catches the next
     * rename doing the same thing.
     */
    const strandedInArabic = Object.entries(flatten(ar)).filter(([, value]) =>
      String(value).includes(brand.name),
    );
    const strandedInEnglish = Object.entries(flatten(en)).filter(([, value]) =>
      String(value).includes(brand.nameAr),
    );

    expect(strandedInArabic.map(([key]) => key)).toEqual([]);
    expect(strandedInEnglish.map(([key]) => key)).toEqual([]);
  });

  it('reaches the offline page, which cannot import it', () => {
    const offline = read('public', 'offline.html');

    expect(offline).toContain(brand.name);
    expect(offline).toContain(brand.themeColor);
    expect(offline).toContain(brand.backgroundColor);
  });

  it('leaves no second copy of the name in the shell', () => {
    /*
     * The manifest and the root layout are where a rename is most expensive
     * to get wrong: the name in the manifest becomes a taskbar shortcut the
     * operating system keeps for ever, and no later language change can
     * rename it. Both must read the config rather than repeat it.
     */
    for (const file of [
      ['app', 'manifest.js'],
      ['app', 'layout.jsx'],
    ]) {
      const source = read(...file);

      expect(source).toContain('brand.config');
      // The name may appear in prose; a quoted string of it is a hard copy.
      expect(source).not.toContain(`'${brand.name}'`);
      expect(source).not.toContain(`"${brand.name}"`);
    }
  });

  it('keeps the installed colours in step with the stylesheet', () => {
    // An install that flashes a colour the application does not use reads as
    // a different product opening.
    const css = read('app', 'globals.css');

    expect(css).toContain(brand.themeColor);
  });
});
