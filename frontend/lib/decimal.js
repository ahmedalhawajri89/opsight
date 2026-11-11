/**
 * Sums decimal strings exactly. The amounts arrive as strings with up to
 * four places; adding them as floats would print "312400.49999999994".
 */
export function sumAmounts(values) {
  const SCALE = 10_000n;
  let total = 0n;

  for (const raw of values) {
    if (raw === null || raw === undefined || raw === '') continue;

    const [whole, fraction = ''] = String(raw).replace('-', '').split('.');
    const units = BigInt(whole || '0') * SCALE + BigInt((fraction + '0000').slice(0, 4));

    total += String(raw).startsWith('-') ? -units : units;
  }

  const negative = total < 0n;
  const abs = negative ? -total : total;
  const fraction = String(abs % SCALE).padStart(4, '0');

  return `${negative ? '-' : ''}${abs / SCALE}.${fraction}`;
}
