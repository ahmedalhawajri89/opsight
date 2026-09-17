import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { intlTag, normaliseLocale, normaliseNumerals, directionOf } from '@/lib/i18n/config';
import { describeFilters } from '@/lib/i18n/filters';
import { createTranslator, splitTags } from '@/lib/i18n/translate';
import { formatMoney, formatNumber, formatPoints, setFormatLocale } from '@/lib/format';
import ar from '@/lib/i18n/messages/ar';
import en from '@/lib/i18n/messages/en';

const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];

function isPluralNode(node) {
  return (
    node !== null &&
    typeof node === 'object' &&
    Object.keys(node).some((key) => PLURAL_CATEGORIES.includes(key))
  );
}

/** Every message in a dictionary, keyed by its dotted path. A plural object is one message. */
function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string' || isPluralNode(value)) {
      out[path] = value;
    } else {
      flatten(value, path, out);
    }
  }

  return out;
}

/** The placeholders a message can use, across all of its plural forms. */
function placeholders(message) {
  const forms = typeof message === 'string' ? [message] : Object.values(message);
  const names = new Set();

  for (const form of forms) {
    for (const match of form.matchAll(/\{(\w+)\}/g)) names.add(match[1]);
  }

  return [...names].sort();
}

function tags(message) {
  const forms = typeof message === 'string' ? [message] : Object.values(message);

  return [
    ...new Set(forms.flatMap((form) => [...form.matchAll(/<(\w+)>/g)].map((m) => m[1]))),
  ].sort();
}

const EN = flatten(en);
const AR = flatten(ar);

/*
|--------------------------------------------------------------------------
| Dictionary parity
|--------------------------------------------------------------------------
|
| A key missing in Arabic silently falls back to English at runtime, which is
| the right behaviour for a user and the wrong one for a release. These tests
| are what turn that fallback into a failure before it ships.
|
*/

describe('Arabic dictionary', () => {
  it('has every English key', () => {
    expect(Object.keys(EN).filter((key) => !(key in AR))).toEqual([]);
  });

  it('has no key English does not', () => {
    expect(Object.keys(AR).filter((key) => !(key in EN))).toEqual([]);
  });

  it('uses exactly the placeholders of the English message', () => {
    const mismatched = Object.keys(EN)
      .filter((key) => key in AR)
      .filter((key) => placeholders(EN[key]).join() !== placeholders(AR[key]).join())
      .map((key) => `${key}: en {${placeholders(EN[key])}} ar {${placeholders(AR[key])}}`);

    expect(mismatched).toEqual([]);
  });

  it('uses exactly the emphasis tags of the English message', () => {
    const mismatched = Object.keys(EN)
      .filter((key) => key in AR && tags(EN[key]).join() !== tags(AR[key]).join())
      .map((key) => key);

    expect(mismatched).toEqual([]);
  });

  it('gives every plural message an `other` form', () => {
    const incomplete = [...Object.entries(EN), ...Object.entries(AR)]
      .filter(([, message]) => isPluralNode(message) && typeof message.other !== 'string')
      .map(([key]) => key);

    expect(incomplete).toEqual([]);
  });

  it('writes no digit into a sentence', () => {
    // Digits come in through placeholders, formatted in the reader's chosen
    // numerals. A literal "٧" is wrong for a Western-digit reader and a
    // literal "7" for an Arabic-Indic one. ISO 4217 is a standard's name.
    const offending = Object.entries(AR)
      .filter(([, message]) =>
        (typeof message === 'string' ? [message] : Object.values(message)).some((form) =>
          /[0-9٠-٩]/.test(form.replace(/ISO 4217/g, '').replace(/\{\w+\}/g, '')),
        ),
      )
      .map(([key]) => key);

    expect(offending).toEqual([]);
  });

  it('actually translates — no English sentence left behind', () => {
    // Brand and format names are the same in both languages by design.
    const SAME_BY_DESIGN = new Set([
      'common.appName',
      'dashboard.topProducts.rank',
      'pagination.page',
      'pagination.range',
    ]);

    const untranslated = Object.keys(EN)
      .filter((key) => !SAME_BY_DESIGN.has(key))
      .filter((key) => JSON.stringify(EN[key]) === JSON.stringify(AR[key]));

    expect(untranslated).toEqual([]);
  });
});

/*
|--------------------------------------------------------------------------
| Every key the code asks for exists
|--------------------------------------------------------------------------
|
| A typo in `t('dashbord.title')` renders the raw key on screen. Scanning the
| source for literal keys catches it here instead of in a screenshot. Keys
| built at runtime (`metrics.${key}.label`) are checked by their static
| prefix.
|
*/

const SOURCE_DIRS = ['app', 'components', 'features', 'lib', 'hooks'];

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);

    if (statSync(path).isDirectory()) return name === 'messages' ? [] : sourceFiles(path);

    return /\.(jsx?|mjs)$/.test(name) ? [path] : [];
  });
}

function nodeAt(key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), en);
}

describe('message keys used in source', () => {
  const files = SOURCE_DIRS.flatMap((dir) => sourceFiles(join(process.cwd(), dir))).filter(
    // The gallery is a development screen and deliberately stays in English.
    (file) => !file.includes('gallery'),
  );

  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('resolves every literal key', () => {
    const missing = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const literal = [
        ...source.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g),
        ...source.matchAll(/<Trans\s+k="([a-zA-Z0-9_.]+)"/g),
      ];

      for (const [, key] of literal) {
        const node = nodeAt(key);

        if (typeof node !== 'string' && !isPluralNode(node)) {
          missing.push(`${relative(process.cwd(), file)}: ${key}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('resolves the static prefix of every built key', () => {
    const missing = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');

      for (const [, prefix] of source.matchAll(/\bt(?:\.has)?\(\s*`([a-zA-Z0-9_.]+)\.\$\{/g)) {
        const node = nodeAt(prefix);

        if (node === null || typeof node !== 'object') {
          missing.push(`${relative(process.cwd(), file)}: ${prefix}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});

/*
|--------------------------------------------------------------------------
| The translation engine
|--------------------------------------------------------------------------
*/

describe('createTranslator', () => {
  const english = {
    greeting: 'Hello {name}',
    items: { one: '{count} item', other: '{count} items' },
    onlyEnglish: 'Fallback text',
    group: { nested: 'Nested' },
  };

  const arabic = {
    greeting: 'مرحبًا {name}',
    items: {
      zero: 'لا عناصر',
      one: 'عنصر واحد',
      two: 'عنصران',
      few: '{count} عناصر',
      many: '{count} عنصرًا',
      other: '{count} عنصر',
    },
    group: { nested: 'متداخل' },
  };

  function arabicT(numerals = 'latn', onMissing) {
    const tag = intlTag('ar', numerals);

    return createTranslator({
      messages: arabic,
      fallback: english,
      intlLocale: tag,
      formatCount: (count) => new Intl.NumberFormat(tag).format(count),
      onMissing,
    });
  }

  it('interpolates named placeholders', () => {
    expect(arabicT()('greeting', { name: 'أحمد' })).toBe('مرحبًا أحمد');
  });

  it('leaves an unsupplied placeholder visible rather than printing undefined', () => {
    expect(arabicT()('greeting')).toBe('مرحبًا {name}');
  });

  it('reads nested keys', () => {
    expect(arabicT()('group.nested')).toBe('متداخل');
  });

  it.each([
    [0, 'لا عناصر'],
    [1, 'عنصر واحد'],
    [2, 'عنصران'],
    [3, '3 عناصر'],
    [10, '10 عناصر'],
    [11, '11 عنصرًا'],
    [99, '99 عنصرًا'],
    [100, '100 عنصر'],
    [103, '103 عناصر'],
  ])('chooses the Arabic plural form for %i', (count, expected) => {
    expect(arabicT()('items', { count })).toBe(expected);
  });

  it('writes {count} in the chosen numerals', () => {
    expect(arabicT('arab')('items', { count: 25 })).toBe('٢٥ عنصرًا');
  });

  it('prefers an exact-number form over the category', () => {
    const t = createTranslator({
      messages: { x: { 1: 'exactly one', one: 'category one', other: 'other' } },
      intlLocale: 'en-GB',
    });

    expect(t('x', { count: 1 })).toBe('exactly one');
  });

  it('uses English plurals for English', () => {
    const t = createTranslator({ messages: english, intlLocale: 'en-GB' });

    expect(t('items', { count: 1 })).toBe('1 item');
    expect(t('items', { count: 2 })).toBe('2 items');
  });

  it('falls back to English for a key Arabic lacks, without reporting it missing', () => {
    const onMissing = vi.fn();

    expect(arabicT('latn', onMissing)('onlyEnglish')).toBe('Fallback text');
    expect(onMissing).not.toHaveBeenCalled();
  });

  it('returns the key and reports it when neither dictionary has it', () => {
    const onMissing = vi.fn();

    expect(arabicT('latn', onMissing)('no.such.key')).toBe('no.such.key');
    expect(onMissing).toHaveBeenCalledWith('no.such.key');
  });

  it('returns the key for a namespace rather than an object', () => {
    expect(arabicT()('group')).toBe('group');
  });

  it('answers has() without reporting a miss', () => {
    const onMissing = vi.fn();
    const t = arabicT('latn', onMissing);

    expect(t.has('group.nested')).toBe(true);
    expect(t.has('onlyEnglish')).toBe(true);
    expect(t.has('no.such.key')).toBe(false);
    expect(onMissing).not.toHaveBeenCalled();
  });
});

describe('splitTags', () => {
  it('splits emphasised runs from plain text', () => {
    expect(splitTags('Cost is <strong>fixed</strong> at sale.')).toEqual([
      'Cost is ',
      { tag: 'strong', text: 'fixed' },
      ' at sale.',
    ]);
  });

  it('returns a message without tags whole', () => {
    expect(splitTags('Plain')).toEqual(['Plain']);
  });
});

/*
|--------------------------------------------------------------------------
| Locale configuration and formatting
|--------------------------------------------------------------------------
*/

describe('locale configuration', () => {
  it('falls back to English for an unknown language', () => {
    expect(normaliseLocale('fr')).toBe('en');
    expect(normaliseLocale(undefined)).toBe('en');
  });

  it('only offers Arabic-Indic digits in Arabic', () => {
    expect(normaliseNumerals('en', 'arab')).toBe('latn');
    expect(normaliseNumerals('ar', 'arab')).toBe('arab');
    expect(normaliseNumerals('ar', 'roman')).toBe('latn');
  });

  it('carries the numbering system in the Intl tag', () => {
    expect(intlTag('en', 'arab')).toBe('en-GB');
    expect(intlTag('ar', 'latn')).toBe('ar-BH-u-nu-latn');
    expect(intlTag('ar', 'arab')).toBe('ar-BH-u-nu-arab');
  });

  it('lays Arabic out right to left', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
  });
});

describe('formatting in Arabic', () => {
  afterEach(() => setFormatLocale('en-GB'));

  it('writes Western digits by default', () => {
    setFormatLocale(intlTag('ar', 'latn'), { points: ar.format.pointsUnit });

    expect(formatNumber(1234)).toMatch(/1.234|1,234/);
    expect(formatNumber(1234)).not.toMatch(/[٠-٩]/);
  });

  it('writes Arabic-Indic digits when chosen, in money as well as numbers', () => {
    setFormatLocale(intlTag('ar', 'arab'), { points: ar.format.pointsUnit });

    expect(formatNumber(25)).toBe('٢٥');
    expect(formatMoney('12.500')).toMatch(/[٠-٩]/);
    expect(formatMoney('12.500')).not.toMatch(/[0-9]/);
  });

  it('names the percentage-point unit in Arabic', () => {
    setFormatLocale(intlTag('ar', 'latn'), { points: ar.format.pointsUnit });

    expect(formatPoints(2.5)).toContain('نقطة');
  });
});

describe('describeFilters', () => {
  const t = createTranslator({ messages: ar, fallback: en, intlLocale: 'ar-BH' });

  it('names each filter and translates vocabulary values', () => {
    expect(
      describeFilters(
        ['status', 'is_active', 'role', 'search'],
        { status: 'cancelled', is_active: 'true', role: 'owner', search: 'ORD-1' },
        t,
      ),
    ).toEqual(['الحالة: ملغى', 'نشط: نعم', 'الدور: مالك', 'البحث: ORD-1']);
  });
});
