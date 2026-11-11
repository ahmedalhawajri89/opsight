'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useI18n } from '@/features/i18n/I18nProvider';
import { Icon, ICON_NAMES } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';

/**
 * The component gallery's own furniture: the contents rail, the preview
 * toolbar, the section frame, and the foundation panels.
 *
 * WHY THE GALLERY EXISTS, since it is easy to mistake for decoration: it is
 * the one place every component is seen in every state, side by side, in
 * either theme and either direction. A broken empty state, a token that goes
 * unreadable in dark mode, a layout that falls apart in Arabic — each shows
 * up here in seconds rather than on a customer's screen. The browser suite
 * opens it in the production build, so a component that throws stops the
 * build. And for anyone new to the codebase it answers "does this already
 * exist?" before they build a second one.
 */

/** The page's order, and the rail's. Titles are the section headings. */
export const GALLERY_GROUPS = [
  {
    key: 'foundations',
    label: 'Foundations',
    items: ['Colour tokens', 'Typography', 'Shape & elevation', 'Icons'],
  },
  {
    key: 'components',
    label: 'Components',
    items: [
      'Buttons',
      'Form controls',
      'Badges',
      'Comparison values',
      'Stat tiles',
      'Period selector',
      'Overlays',
      'Detail sheet',
    ],
  },
  {
    key: 'data',
    label: 'Data & states',
    items: ['Data table', 'Table states', 'Other states', 'Skeletons'],
  },
  {
    key: 'charts',
    label: 'Charts',
    items: ['Ranking', 'Revenue to profit', 'Trend', 'Revenue and expenses'],
  },
];

export const slug = (title) =>
  title
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const FilterContext = createContext('');

export function GalleryFilter({ query, children }) {
  return (
    <FilterContext.Provider value={query.trim().toLowerCase()}>{children}</FilterContext.Provider>
  );
}

/** Copies text and says so for a moment. */
function useCopy() {
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    if (copied === null) return undefined;

    const timer = setTimeout(() => setCopied(null), 1400);

    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
    } catch {
      // A refused clipboard leaves the text on screen to select by hand.
    }
  };

  return [copied, copy];
}

/**
 * One section: a heading the rail links to, what the component is FOR (not
 * what it looks like — the demo shows that), and the line that imports it.
 */
export function GallerySection({ title, note, use, children }) {
  const query = useContext(FilterContext);
  const [copied, copy] = useCopy();

  if (query && !title.toLowerCase().includes(query)) return null;

  return (
    <section
      id={slug(title)}
      className="scroll-mt-24 space-y-4 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-(--border-subtle) pb-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-(--color-text)">{title}</h2>
          {note && <p className="mt-0.5 text-sm text-(--color-text-2)">{note}</p>}
        </div>
        {use ? (
          <button
            type="button"
            onClick={() => copy(use)}
            title={use}
            className="inline-flex max-w-full items-center gap-1.5 rounded-(--radius-control) border border-(--border) px-2 py-1 font-mono text-xs text-(--color-text-2) transition-colors hover:border-(--color-brand) hover:text-(--color-text)"
          >
            <Icon name={copied === use ? 'check' : 'copy'} size={13} aria-hidden="true" />
            <span className="truncate" dir="ltr">
              {copied === use ? 'Copied' : use}
            </span>
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** The contents, sticky, with the section in view marked. */
export function GalleryRail({ query }) {
  const [active, setActive] = useState(null);
  const q = query.trim().toLowerCase();

  useEffect(() => {
    const ids = GALLERY_GROUPS.flatMap((group) => group.items.map(slug));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );

    ids.forEach((id) => {
      const element = document.getElementById(id);

      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [q]);

  return (
    <nav
      aria-label="Gallery contents"
      className="sticky top-20 max-h-[calc(100dvh-6rem)] space-y-5 overflow-y-auto pe-2"
    >
      {GALLERY_GROUPS.map((group) => {
        const items = group.items.filter((item) => !q || item.toLowerCase().includes(q));

        if (items.length === 0) return null;

        return (
          <div key={group.key}>
            <p className="px-2 text-xs font-semibold tracking-(--tracking-eyebrow) text-(--color-muted) uppercase">
              {group.label}
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {items.map((item) => (
                <li key={item}>
                  <a
                    href={`#${slug(item)}`}
                    aria-current={active === slug(item) ? 'location' : undefined}
                    className={cn(
                      'block rounded-(--radius-control) px-2 py-1.5 text-sm transition-colors',
                      active === slug(item)
                        ? 'bg-(--color-brand-soft) font-medium text-(--color-brand-text)'
                        : 'text-(--color-text-2) hover:bg-(--color-surface-selected) hover:text-(--color-text)',
                    )}
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Theme and direction, switched here rather than in the operating system.
 *
 * The theme is set on <html> the way the application sets it, and put back
 * when the reader leaves the page. Direction is the real language switch,
 * because the charts take their direction from the language, not from CSS.
 */
export function PreviewToolbar({ query, onQuery }) {
  const { locale, setPreferences } = useI18n();
  // Read once, from <html>, as the page was opened.
  const [theme, setTheme] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
      ? 'dark'
      : 'light',
  );

  // Whatever theme the reader arrived with is put back when they leave.
  useEffect(() => {
    const root = document.documentElement;
    const before = root.dataset.theme;

    return () => {
      if (before) root.dataset.theme = before;
      else delete root.dataset.theme;
    };
  }, []);

  function applyTheme(next) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="relative">
        <span className="sr-only">Filter sections</span>
        <Icon
          name="search"
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-(--color-muted)"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Filter sections…"
          className="h-8 w-48 rounded-(--radius-control) border border-(--border) bg-(--color-surface) ps-8 pe-2 text-sm text-(--color-text) placeholder:text-(--color-muted)"
        />
      </label>
      <Segmented
        label="Theme"
        value={theme}
        onChange={applyTheme}
        options={[
          ['light', 'Light'],
          ['dark', 'Dark'],
        ]}
      />
      <Segmented
        label="Language"
        value={locale}
        onChange={(next) => setPreferences({ locale: next })}
        options={[
          ['en', 'English'],
          ['ar', 'العربية'],
        ]}
      />
    </div>
  );
}

function Segmented({ label, value, onChange, options }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-(--radius-control) border border-(--border) bg-(--color-surface) p-0.5"
    >
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={cn(
            'rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1 text-xs font-medium transition-colors',
            value === key
              ? 'bg-(--color-brand) text-(--color-on-brand)'
              : 'text-(--color-text-2) hover:text-(--color-text)',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * The palette, each swatch with the value it resolves to in the CURRENT
 * theme — read from the computed style, so switching the theme above shows
 * the dark values, and a token that resolves to nothing is visibly empty.
 */
export function Swatches({ groups }) {
  const [values, setValues] = useState({});
  const [copied, copy] = useCopy();

  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      const next = {};

      groups.forEach((group) =>
        group.tokens.forEach((token) => (next[token] = style.getPropertyValue(token).trim())),
      );
      setValues(next);
    };

    read();

    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, [groups]);

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="mb-2 text-xs font-medium tracking-wide text-(--color-text-2) uppercase">
            {group.title}
          </p>
          <ul className="space-y-1.5">
            {group.tokens.map((token) => (
              <li key={token}>
                <button
                  type="button"
                  onClick={() => copy(`var(${token})`)}
                  className="flex w-full items-center gap-2.5 rounded-(--radius-control) p-1 text-start transition-colors hover:bg-(--color-surface-selected)"
                >
                  <span
                    className="size-8 shrink-0 rounded-lg border border-(--color-line)"
                    style={{ background: `var(${token})` }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <code className="block truncate font-mono text-xs text-(--color-text)">
                      {token}
                    </code>
                    <code className="block font-mono text-[11px] text-(--color-muted)" dir="ltr">
                      {copied === `var(${token})` ? 'Copied' : values[token] || '—'}
                    </code>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Every icon in the set, by name; click to copy the name. */
export function IconLibrary() {
  const [filter, setFilter] = useState('');
  const [copied, copy] = useCopy();
  const names = useMemo(
    () => ICON_NAMES.filter((name) => name.toLowerCase().includes(filter.trim().toLowerCase())),
    [filter],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={`Search ${ICON_NAMES.length} icons…`}
          aria-label="Search icons"
          className="h-8 w-56 rounded-(--radius-control) border border-(--border) bg-(--color-surface) px-2.5 text-sm text-(--color-text) placeholder:text-(--color-muted)"
        />
        <span className="text-xs text-(--color-muted)">
          {names.length} shown · click to copy the name
        </span>
      </div>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
        {names.map((name) => (
          <li key={name}>
            <button
              type="button"
              onClick={() => copy(name)}
              className="flex w-full flex-col items-center gap-2 rounded-lg border border-(--border-subtle) px-2 py-3 text-(--color-text-2) transition-colors hover:border-(--color-brand) hover:text-(--color-brand-text)"
            >
              <Icon name={copied === name ? 'check' : name} size={20} aria-hidden="true" />
              <span className="w-full truncate text-center font-mono text-[11px]">
                {copied === name ? 'Copied' : name}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The type scale in use, each step with its size. */
export function TypeScale() {
  const steps = [
    ['text-2xl', 'Hero figure', '24px'],
    ['text-xl', 'Tile figure', '20px'],
    ['text-lg', 'Card figure', '18px'],
    ['text-base', 'Section heading', '16px'],
    ['text-sm', 'Body and tables', '14px'],
    ['text-xs', 'Labels and notes', '12px'],
  ];

  return (
    <ul className="divide-y divide-(--border-subtle)">
      {steps.map(([cls, use, px]) => (
        <li key={cls} className="flex items-baseline justify-between gap-4 py-2.5">
          <span className={cn(cls, 'text-(--color-text)')}>
            {use} · <span lang="ar">صافي الإيرادات ١٢٬٤٠٠٫٥٠٠ د.ب.</span>
          </span>
          <code className="shrink-0 font-mono text-xs text-(--color-muted)">
            {cls} · {px}
          </code>
        </li>
      ))}
    </ul>
  );
}

/** Radii and elevation: the corners and shadows the system allows. */
export function ShapeScale() {
  const radii = [
    ['--radius-chip', 'Chips'],
    ['--radius-control', 'Controls'],
    ['--radius-card', 'Cards'],
  ];
  const shadows = [
    ['--shadow-card', 'Card'],
    ['--shadow-overlay', 'Overlay'],
  ];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="flex flex-wrap gap-4">
        {radii.map(([token, label]) => (
          <div key={token} className="text-center">
            <div
              className="size-16 border-2 border-(--color-brand) bg-(--color-brand-soft)"
              style={{ borderRadius: `var(${token})` }}
            />
            <p className="mt-1.5 text-xs text-(--color-text-2)">{label}</p>
            <code className="font-mono text-[11px] text-(--color-muted)">{token}</code>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        {shadows.map(([token, label]) => (
          <div key={token} className="text-center">
            <div
              className="size-16 rounded-(--radius-card) bg-(--color-surface)"
              style={{ boxShadow: `var(${token})` }}
            />
            <p className="mt-1.5 text-xs text-(--color-text-2)">{label}</p>
            <code className="font-mono text-[11px] text-(--color-muted)">{token}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
