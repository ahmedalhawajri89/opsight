'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/cn';

/**
 * The dashboard's lists, one at a time.
 *
 * The latest orders, the best sellers, stock and the activity log used to sit
 * on the page together, four tables competing for the same glance. They are
 * a choice now: one is open, the others are a named tab away, and the page
 * is a screen shorter for it.
 *
 * The WAI-ARIA tabs pattern, keyboard included: arrows move between tabs
 * (mirrored in Arabic, where "next" is to the left), Home and End go to the
 * ends, and only the selected tab is in the tab order, so Tab moves into the
 * panel rather than through every tab.
 *
 * `tabs` is already filtered by the caller for what the reader's role may
 * see; a tab for a refused list is never offered.
 *
 * @param {Array<{id: string, label: string, icon: string, render: () => import('react').ReactNode}>} tabs
 */
export function DashboardTabs({ tabs, label }) {
  const { dir } = useI18n();
  const reduced = useReducedMotion();
  const base = useId();
  const [selected, setSelected] = useState(tabs[0]?.id);
  const list = useRef(null);
  const indicator = useRef(null);
  const panel = useRef(null);
  const first = useRef(true);

  const current = tabs.find((tab) => tab.id === selected) ?? tabs[0];

  /*
   * The indicator slides to the chosen tab and the panel rises into place.
   * Measured after layout, so it is right in both directions and at any
   * width; set outright on the first paint and for a reader who asked for
   * less motion.
   */
  useLayoutEffect(() => {
    const node = list.current?.querySelector('[aria-selected="true"]');
    const bar = indicator.current;

    if (!node || !bar) return;

    const target = { x: node.offsetLeft, width: node.offsetWidth };

    if (first.current || reduced) {
      gsap.set(bar, target);
    } else {
      gsap.to(bar, { ...target, duration: 0.45, ease: 'power3.out' });

      if (panel.current) {
        gsap.fromTo(
          panel.current,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', clearProps: 'transform,opacity' },
        );
      }
    }

    first.current = false;
  }, [current?.id, reduced, dir]);

  if (!current) return null;

  function onKeyDown(event) {
    const index = tabs.findIndex((tab) => tab.id === current.id);
    const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const back = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';

    const next = {
      [forward]: (index + 1) % tabs.length,
      [back]: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }[event.key];

    if (next === undefined) return;

    event.preventDefault();
    setSelected(tabs[next].id);
    list.current?.querySelectorAll('[role="tab"]')[next]?.focus();
  }

  return (
    <section className="rise" style={{ '--rise-index': 6 }} aria-label={label}>
      <div className="overflow-x-auto">
        <div
          ref={list}
          role="tablist"
          aria-label={label}
          onKeyDown={onKeyDown}
          className="relative inline-flex min-w-full gap-1 rounded-(--radius-pill) border border-(--color-line) bg-(--color-surface) p-1 shadow-(--shadow-card) sm:min-w-0"
        >
          {/* The sliding key: under the selected tab, in the brand's ink. */}
          <span
            ref={indicator}
            aria-hidden="true"
            className="absolute inset-y-1 left-0 rounded-(--radius-pill) bg-(--color-brand-panel)"
          />

          {tabs.map((tab) => {
            const active = tab.id === current.id;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`${base}-${tab.id}-tab`}
                aria-selected={active}
                aria-controls={`${base}-${tab.id}-panel`}
                tabIndex={active ? 0 : -1}
                onClick={() => setSelected(tab.id)}
                className={cn(
                  'relative z-10 inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-(--radius-pill) px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-(--duration-base) sm:flex-none',
                  active
                    ? 'text-(--color-on-brand)'
                    : 'text-(--color-text-2) hover:text-(--color-text)',
                )}
              >
                <Icon
                  name={tab.icon}
                  size={16}
                  className={active ? 'text-(--color-accent-on-brand)' : 'text-(--color-muted)'}
                />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={panel}
        role="tabpanel"
        id={`${base}-${current.id}-panel`}
        aria-labelledby={`${base}-${current.id}-tab`}
        className="mt-4"
      >
        {current.render()}
      </div>
    </section>
  );
}
