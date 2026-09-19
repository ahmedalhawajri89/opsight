import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Automated WCAG AA contrast check over the token palette.
 *
 * "Verified with an automated check, not by eye" (UI_UX_DIRECTION.md §4).
 * Judging contrast by eye is unreliable, and dark mode is where it quietly
 * fails — which is exactly why both themes are checked here rather than only
 * the one a developer happens to be using.
 *
 * Thresholds: 4.5:1 for body text, 3:1 for large text and for the boundary of
 * any meaningful graphical element.
 */

// Resolved from the project root: under jsdom, import.meta.url is not a file URL.
const CSS = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');

/** Pull `--name: #hex;` pairs out of a `:root { ... }` block. */
function parseTokens(block) {
  const tokens = {};

  for (const match of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[match[1]] = match[2];
  }

  return tokens;
}

function extractThemes(css) {
  // Dark is an explicit choice rather than an OS-following media query, so the
  // light set is everything before the attribute block.
  const darkIndex = css.indexOf(":root[data-theme='dark']");

  expect(darkIndex, 'globals.css must define a dark theme').toBeGreaterThan(-1);

  const lightBlock = css.slice(0, darkIndex);
  const darkBlock = css.slice(darkIndex);

  return { light: parseTokens(lightBlock), dark: parseTokens(darkBlock) };
}

function toRgb(hex) {
  const normalised =
    hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex.slice(0, 7);

  return [
    parseInt(normalised.slice(1, 3), 16),
    parseInt(normalised.slice(3, 5), 16),
    parseInt(normalised.slice(5, 7), 16),
  ];
}

/** WCAG 2.1 relative luminance. */
function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const c = channel / 255;

    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];

  return (lighter + 0.05) / (darker + 0.05);
}

/* -------------------------------------------------------------------------- */
/* Colour-blindness simulation and perceptual distance                         */
/* -------------------------------------------------------------------------- */

/**
 * Viénot–Brettel–Mollon dichromat simulation, applied in linear RGB.
 *
 * Roughly 8% of men have one of these two conditions, and a chart whose series
 * collapse into one colour for them is simply unreadable.
 */
const VISION_MATRICES = {
  normal: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  protanopia: [
    [0.11238, 0.88762, 0],
    [0.11238, 0.88762, 0],
    [0.00401, -0.00401, 1],
  ],
  deuteranopia: [
    [0.29275, 0.70725, 0],
    [0.29275, 0.70725, 0],
    [-0.02234, 0.02234, 1],
  ],
};

function toLinear(hex) {
  return toRgb(hex).map((channel) => {
    const c = channel / 255;

    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
}

function simulate(hex, vision) {
  const linear = toLinear(hex);

  return VISION_MATRICES[vision].map((row) =>
    Math.max(0, Math.min(1, row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2])),
  );
}

/** Linear RGB → CIE XYZ (D65) → CIE Lab. */
function toLab([r, g, b]) {
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 colour difference. Adequate for a pass/fail gate at this threshold. */
function deltaE(a, b) {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);

  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/**
 * ΔE above ~10 is clearly noticeable; above ~15 reads as a distinctly different
 * colour at a glance, which is the bar for a chart legend. The shipped palette
 * measures 16.4 (light) and 23.0 (dark) at its worst pair.
 */
const MIN_SERIES_DELTA_E = 15;

const themes = extractThemes(CSS);

/**
 * [foreground token, background token, minimum ratio, what it is]
 *
 * All three text roles are held to 4.5:1 on every surface, including the
 * muted one: a caption that fails contrast is not a caption, it is a
 * decoration that happens to contain words.
 */
const TEXT_PAIRS = [
  ['text', 'surface', 4.5, 'body text on a card'],
  ['text', 'ground', 4.5, 'body text on the page ground'],
  ['text', 'surface-subtle', 4.5, 'body text on the half-step surface'],
  ['text', 'surface-hover', 4.5, 'body text on a hovered row'],
  ['text', 'surface-selected', 4.5, 'body text on a selected row'],
  ['text-2', 'surface', 4.5, 'secondary text on a card'],
  ['text-2', 'ground', 4.5, 'secondary text on the page ground'],
  ['text-2', 'surface-hover', 4.5, 'secondary text on a hovered row'],
  ['muted', 'surface', 4.5, 'labels and captions on a card'],
  ['muted', 'ground', 4.5, 'metadata on the page ground'],
  ['muted', 'surface-subtle', 4.5, 'metadata on the half-step surface'],
  ['brand-text', 'surface', 4.5, 'link text'],
  ['brand-text', 'brand-soft', 4.5, 'active navigation item'],
  ['brand-text', 'info-soft', 4.5, 'context banner text'],
  ['accent-strong', 'surface', 4.5, 'accent text'],
  ['accent-strong', 'accent-soft', 4.5, 'accent badge'],
  ['success', 'surface', 4.5, 'favourable change'],
  ['success', 'success-soft', 4.5, 'success badge'],
  ['danger', 'surface', 4.5, 'unfavourable change'],
  ['danger', 'danger-soft', 4.5, 'danger badge'],
  ['warning', 'surface', 4.5, 'warning text'],
  ['warning', 'warning-soft', 4.5, 'warning badge'],
  ['info', 'surface', 4.5, 'informational text'],
  ['info', 'info-soft', 4.5, 'informational banner'],
  ['text-inverse', 'brand', 4.5, 'primary button label'],
];

/** Non-text elements: 3:1 is the requirement for a meaningful boundary. */
const GRAPHIC_PAIRS = [
  ['border-strong', 'surface', 3, 'input border'],
  ['accent', 'surface', 3, 'focus ring on a card'],
  ['accent', 'ground', 3, 'focus ring on the page ground'],
  ['brand', 'surface', 3, 'primary button against a card'],
];

for (const [themeName, tokens] of Object.entries(themes)) {
  describe(`${themeName} theme`, () => {
    it('defines every token the other theme defines', () => {
      const other = themeName === 'light' ? themes.dark : themes.light;

      // A token defined in only one theme renders as whatever it inherited —
      // usually the wrong colour, and usually only noticed by a user.
      expect(Object.keys(tokens).sort()).toEqual(Object.keys(other).sort());
    });

    it.each(TEXT_PAIRS)(
      '%s on %s meets %s:1 — %s',
      (foreground, background, minimum, description) => {
        expect(tokens[foreground], `--${foreground} is not defined`).toBeDefined();
        expect(tokens[background], `--${background} is not defined`).toBeDefined();

        const ratio = contrastRatio(tokens[foreground], tokens[background]);

        expect(
          Number(ratio.toFixed(2)),
          `${description}: --${foreground} (${tokens[foreground]}) on --${background} (${tokens[background]}) is ${ratio.toFixed(2)}:1, below ${minimum}:1`,
        ).toBeGreaterThanOrEqual(minimum);
      },
    );

    it.each(GRAPHIC_PAIRS)(
      '%s against %s meets %s:1 — %s',
      (foreground, background, minimum, description) => {
        const ratio = contrastRatio(tokens[foreground], tokens[background]);

        expect(
          Number(ratio.toFixed(2)),
          `${description}: ${ratio.toFixed(2)}:1, below ${minimum}:1`,
        ).toBeGreaterThanOrEqual(minimum);
      },
    );

    it('keeps the six categorical chart colours distinguishable from the background', () => {
      for (let index = 1; index <= 6; index += 1) {
        const ratio = contrastRatio(tokens[`chart-${index}`], tokens.surface);

        expect(
          Number(ratio.toFixed(2)),
          `--chart-${index} (${tokens[`chart-${index}`]}) is ${ratio.toFixed(2)}:1 against the card surface`,
        ).toBeGreaterThanOrEqual(3);
      }
    });

    /*
     * Categorical distinguishability is NOT a luminance-contrast question.
     * Two colours can have an identical luminance ratio and still be obviously
     * different (orange against green), or differ in ratio and be identical to
     * a colour-blind viewer. WCAG contrast measures text legibility against a
     * background; it says nothing about telling two series apart.
     *
     * So: simulate the vision, then measure perceptual distance in Lab.
     */
    it.each(['normal', 'protanopia', 'deuteranopia'])(
      'keeps all six categorical series distinguishable under %s vision',
      (vision) => {
        const chart = Array.from({ length: 6 }, (_, i) => tokens[`chart-${i + 1}`]);

        for (let i = 0; i < chart.length; i += 1) {
          for (let j = i + 1; j < chart.length; j += 1) {
            const distance = deltaE(simulate(chart[i], vision), simulate(chart[j], vision));

            expect(
              Number(distance.toFixed(1)),
              `Under ${vision}, --chart-${i + 1} (${chart[i]}) and --chart-${j + 1} (${chart[j]}) are only ΔE ${distance.toFixed(1)} apart — a viewer cannot reliably tell them apart in a chart.`,
            ).toBeGreaterThanOrEqual(MIN_SERIES_DELTA_E);
          }
        }
      },
    );
  });
}
