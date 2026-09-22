import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Design tokens must reach the browser.
 *
 * This test exists because, from Phase 02 until the dashboard redesign, NONE of
 * them did. Every token class was written in Tailwind v3's shorthand —
 * `border-` followed by `[--color-line]` — which Tailwind v4 compiles to the literal
 * `border-color: --color-line`. That is invalid CSS, so the browser discarded
 * it: every border fell back to the text colour, every semantic tone to plain
 * text, every radius to square. 320 classes, and nothing failed. The contrast
 * test kept passing throughout, because it reads the token VALUES in
 * globals.css, and the values were fine; what was broken was the wiring
 * between them and the markup.
 *
 * v4 spells a variable reference `border-(--color-line)`. This scans every
 * source file for the old form, including strings passed to `cn()`, which the
 * ESLint className rule cannot see.
 */

const ROOT = resolve(process.cwd());
const SCANNED = ['app', 'components', 'features', 'hooks', 'lib'];

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);

    if (statSync(path).isDirectory()) return sourceFiles(path);

    return /\.(jsx?|mjs)$/.test(entry) ? [path] : [];
  });
}

describe('token class syntax', () => {
  it('never uses the Tailwind v3 [--variable] shorthand, which v4 compiles to invalid CSS', () => {
    const offenders = [];

    for (const dir of SCANNED) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const lines = readFileSync(file, 'utf8').split('\n');

        lines.forEach((line, index) => {
          const match = line.match(/[a-z]-\[--[a-z0-9-]+\]/);

          if (match) offenders.push(`${file.slice(ROOT.length + 1)}:${index + 1}  ${match[0]}`);
        });
      }
    }

    expect(
      offenders,
      `Use the v4 form, e.g. border-(--color-line):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

/*
 * Every raw `var(--x)` must name a token that exists.
 *
 * Charts pass colours to SVG as `var(--text-2)` rather than as utility classes,
 * which the check above cannot see. When the design system renamed its tokens,
 * ten of those survived under their old names — `var(--text-muted)`,
 * `var(--negative)` — and pointed at nothing, so the browser quietly used its
 * default instead. This fails on the first one.
 */
describe('raw CSS variable references', () => {
  // Set at runtime, not in globals.css: next/font's families, the assembled
  // font stack on <html>, and per-element animation indices.
  const RUNTIME = new Set(['font-inter', 'font-arabic', 'font-mono-ui', 'font-stack', 'i', 'd']);

  it('never references a token globals.css does not define', () => {
    const css = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
    const defined = new Set([...css.matchAll(/^\s*--([a-z0-9-]+)\s*:/gm)].map((match) => match[1]));
    const offenders = [];

    for (const dir of SCANNED) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        for (const match of readFileSync(file, 'utf8').matchAll(/var\(--([a-z0-9-]+)\)/g)) {
          if (!defined.has(match[1]) && !RUNTIME.has(match[1])) {
            offenders.push(`${file.slice(ROOT.length + 1)}  var(--${match[1]})`);
          }
        }
      }
    }

    expect(offenders, `Undefined tokens:\n${offenders.join('\n')}`).toEqual([]);
  });
});
