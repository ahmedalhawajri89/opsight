/**
 * Message lookup, interpolation and plurals — the whole translation engine.
 *
 * In-house rather than a library (ADR-017). Every message here is a plain
 * string in a plain object; the only genuinely hard part of translation, plural
 * forms, is handled by the platform's own `Intl.PluralRules`, which knows that
 * Arabic has six categories and English two. What a library would add on top —
 * ICU message parsing, a provider, routing — is weight this application does
 * not need, in a project whose rule is that a dependency must earn its place.
 *
 * MESSAGE SHAPES
 *
 *   'Net revenue'                              plain
 *   'Previous {value}'                         interpolated
 *   { one: '{count} product', other: '…' }     plural — chosen by params.count
 *
 * A plural object may also carry exact-number keys ('0', '1', '2'), which win
 * over the category. Arabic uses them for the dual and for "one" phrased
 * without a digit ("منتج واحد"), which reads far better than "١ منتج".
 */

const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];

function lookup(messages, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), messages);
}

function isPluralNode(node) {
  return (
    node !== null &&
    typeof node === 'object' &&
    Object.keys(node).some((key) => PLURAL_CATEGORIES.includes(key))
  );
}

function interpolate(template, params, formatCount) {
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    if (!Object.hasOwn(params, name)) return match;

    // `count` is the one parameter the engine formats itself, so a plural
    // sentence can never show a Western "3" inside an Arabic-Indic page.
    if (name === 'count' && typeof params.count === 'number' && formatCount) {
      return formatCount(params.count);
    }

    const value = params[name];

    return value === null || value === undefined ? '' : String(value);
  });
}

/**
 * @param {object}   options
 * @param {object}   options.messages     the active dictionary
 * @param {object}   options.fallback     the English dictionary, used for a missing key
 * @param {string}   options.intlLocale   BCP 47 tag, for plural selection
 * @param {function} [options.formatCount] formats `{count}` in the active digits
 * @param {function} [options.onMissing]  reports a key absent from both dictionaries
 */
export function createTranslator({ messages, fallback, intlLocale, formatCount, onMissing }) {
  const rules = new Intl.PluralRules(intlLocale);

  function resolve(key) {
    const own = lookup(messages, key);
    if (own !== undefined) return own;

    // A key missing in Arabic shows the English text rather than the raw key.
    // The parity test stops this reaching a release; this is the safety net
    // for the moment between adding a string and translating it.
    const english = fallback ? lookup(fallback, key) : undefined;
    if (english !== undefined) return english;

    onMissing?.(key);

    return undefined;
  }

  function t(key, params = {}) {
    const node = resolve(key);

    if (node === undefined) return key;

    if (isPluralNode(node)) {
      const count = Number(params.count);
      const exact = Number.isFinite(count) ? node[String(count)] : undefined;
      const template = exact ?? node[rules.select(count)] ?? node.other ?? '';

      return interpolate(template, params, formatCount);
    }

    if (typeof node !== 'string') return key;

    return interpolate(node, params, formatCount);
  }

  /*
   * Whether a key exists, without reporting it as missing. For vocabulary that
   * is open-ended by design — audit action names, recorded field names — where
   * an unknown value is expected and falls back to the raw value on purpose.
   */
  t.has = (key) =>
    lookup(messages, key) !== undefined || (fallback ? lookup(fallback, key) !== undefined : false);

  return t;
}

/**
 * Splits a message containing simple tags into text and tagged runs, for
 * sentences that emphasise part of themselves:
 *
 *   'Cost uses the cost recorded <strong>at the moment of sale</strong>.'
 *
 * Only named, non-nested tags are supported — enough for emphasis, and far too
 * little to be a way of putting markup into a translation file.
 *
 * @returns {Array<string|{tag: string, text: string}>}
 */
export function splitTags(message) {
  const parts = [];
  const pattern = /<(\w+)>(.*?)<\/\1>/g;
  let last = 0;
  let match;

  while ((match = pattern.exec(message)) !== null) {
    if (match.index > last) parts.push(message.slice(last, match.index));
    parts.push({ tag: match[1], text: match[2] });
    last = match.index + match[0].length;
  }

  if (last < message.length) parts.push(message.slice(last));

  return parts;
}
