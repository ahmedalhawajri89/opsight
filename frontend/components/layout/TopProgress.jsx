'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

import { useLoadProgress } from '@/hooks/useLoadProgress';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/* A request quicker than this never shows the bar: a flicker is noise. */
const SHOW_AFTER = 0.15;

/**
 * A thin gold line across the top of the window while the application is
 * fetching, with a bright head that leads it.
 *
 * IT MOVES WITH THE WORK, NOT WITH A CLOCK. Its length is the share of this
 * burst's requests that have come back (useLoadProgress), held a little
 * short of the end until the last one lands, so it never claims to be done
 * early. When the last request settles it runs to the end and fades. A
 * request that joins mid-way lowers the share, and the bar slows rather than
 * jumping back.
 *
 * The one delay (SHOW_AFTER) only decides whether a quick fetch is worth
 * showing at all. Under reduced motion the bar does not glide; it still
 * appears and still says how far the work has got.
 */
export function TopProgress() {
  const { active, progress } = useLoadProgress();
  const reduced = useReducedMotion();
  const bar = useRef(null);
  const head = useRef(null);
  const shown = useRef(false);
  const reach = useRef(0);

  useEffect(() => {
    const line = bar.current;

    if (!line) return;

    if (active) {
      // Never backwards within a burst, and never all the way until done.
      const target = Math.max(reach.current, 0.12 + progress * 0.78);
      reach.current = target;

      if (!shown.current) {
        shown.current = true;
        gsap.set(line, { width: '0%', autoAlpha: 0 });
        gsap.to(line, { autoAlpha: 1, duration: 0.2, delay: reduced ? 0 : SHOW_AFTER });
      }

      gsap.to(line, {
        width: `${target * 100}%`,
        duration: reduced ? 0 : 0.6,
        ease: 'power2.out',
        overwrite: 'auto',
      });

      if (!reduced && head.current) {
        gsap.to(head.current, { opacity: 1, duration: 0.3 });
      }

      return;
    }

    if (shown.current) {
      shown.current = false;
      reach.current = 0;

      gsap
        .timeline()
        .to(line, {
          width: '100%',
          duration: reduced ? 0 : 0.25,
          ease: 'power1.out',
          overwrite: 'auto',
        })
        .to(line, { autoAlpha: 0, duration: 0.3 }, reduced ? 0 : '+=0.05')
        .set(line, { width: '0%' });
    }
  }, [active, progress, reduced]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-[3px] print:hidden"
    >
      <div
        ref={bar}
        className="invisible absolute inset-y-0 start-0 bg-linear-to-l from-(--color-accent-on-brand) via-(--color-chart-profit) to-(--color-accent-on-brand-strong) ltr:bg-linear-to-r"
        style={{ width: '0%' }}
      >
        <span
          ref={head}
          className="absolute inset-y-[-3px] end-0 w-24 opacity-0 [background:radial-gradient(closest-side,color-mix(in_oklab,var(--accent-on-brand-strong)_80%,transparent),transparent)] blur-[2px]"
        />
      </div>
    </div>
  );
}
