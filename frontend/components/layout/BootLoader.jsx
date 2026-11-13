'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

import { useI18n } from '@/features/i18n/I18nProvider';
import { useLoadProgress } from '@/hooks/useLoadProgress';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/*
 * Shown once per visit. After the first entry, moving between screens is the
 * top bar's job (TopProgress), not a curtain over the whole application.
 */
let bootedThisVisit = false;

/* Below this the work was too quick to be worth a curtain at all. */
const APPEAR_AFTER_MS = 180;

/**
 * The first entry into the application: the mark, the name, and how far the
 * work has really got.
 *
 * NOTHING HERE RUNS ON A CLOCK. `ready` comes from the caller (the session is
 * known and the first screen has mounted), and the bowl fills with the share
 * of requests that have actually come back (useLoadProgress). The curtain
 * lifts when both say so: not sooner, and not a second later for effect.
 * The one delay is APPEAR_AFTER_MS, so a cached return visit is not met by a
 * flash of navy; it decides whether the curtain shows, never when it ends.
 *
 * THE DRAWING IS THE MARK, DOING WHAT IT MEANS. A بيدر is the threshing
 * floor where grain is winnowed and gathered: the bowl fills with gold as
 * the data arrives, one grain is tossed and caught above it while the work
 * goes on, and on completion it drops into the bowl before the curtain
 * lifts. The name is written in, right to left, as Arabic is written.
 *
 * Under reduced motion there is no toss, no writing and no lift: the bowl
 * still fills (it carries information), and the curtain simply fades.
 */
export function BootLoader({ ready, children }) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const { progress, active } = useLoadProgress();
  const clipId = useId().replace(/:/g, '');

  const [visible, setVisible] = useState(!bootedThisVisit);
  const [shown, setShown] = useState(false);
  const root = useRef(null);
  const fill = useRef(null);
  const grain = useRef(null);
  const loop = useRef(null);
  const finishing = useRef(false);

  const done = ready && !active;
  const phase = !ready ? 'session' : active ? 'data' : 'ready';
  // The session counts as the first step of the work, so the bowl never
  // reads full while the screen behind it is still asking for its figures.
  const share = done ? 1 : ready ? 0.35 + progress * 0.6 : 0.12 + progress * 0.2;

  // Whether to draw the curtain at all: only if the work outlasts a blink.
  useEffect(() => {
    if (!visible || done) return undefined;

    const id = window.setTimeout(() => setShown(true), APPEAR_AFTER_MS);

    return () => window.clearTimeout(id);
  }, [visible, done]);

  // Done before the curtain was ever drawn: it never will be this visit.
  useEffect(() => {
    if (done && !shown) bootedThisVisit = true;
  }, [done, shown]);

  // The entrance, and the toss that runs while the work does.
  useLayoutEffect(() => {
    if (!shown || !root.current) return undefined;

    const context = gsap.context(() => {
      if (reduced) return;

      gsap.from('[data-boot-mark]', {
        scale: 0.7,
        autoAlpha: 0,
        duration: 0.6,
        ease: 'back.out(1.7)',
      });
      gsap.from('[data-boot-rim]', { strokeDashoffset: 1, duration: 0.9, ease: 'power2.inOut' });
      gsap.fromTo(
        '[data-boot-word]',
        { clipPath: 'inset(0 0 0 100%)' },
        { clipPath: 'inset(0 0 0 0%)', duration: 1.1, ease: 'power3.inOut', delay: 0.25 },
      );
      gsap.from('[data-boot-status]', { autoAlpha: 0, y: 6, duration: 0.4, delay: 0.5 });
      gsap.to('[data-boot-glow]', {
        scale: 1.15,
        opacity: 0.55,
        duration: 1.6,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      });

      loop.current = gsap
        .timeline({ repeat: -1 })
        .to(grain.current, { y: -11, x: -2, duration: 0.42, ease: 'power2.out' })
        .to(grain.current, { y: 0, x: 0, duration: 0.42, ease: 'power2.in' })
        .to(grain.current, {
          scaleY: 0.8,
          scaleX: 1.2,
          duration: 0.08,
          yoyo: true,
          repeat: 1,
          transformOrigin: '50% 100%',
        });
    }, root);

    return () => context.revert();
  }, [shown, reduced]);

  // The bowl follows the real share of work done.
  useEffect(() => {
    if (!shown || !fill.current) return;

    gsap.to(fill.current, {
      attr: { y: 31.2 - 12.6 * share, height: 12.6 * share },
      duration: reduced ? 0 : 0.6,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  }, [share, shown, reduced]);

  // The finish: the grain lands, the mark settles, the curtain lifts.
  useEffect(() => {
    if (!shown || !done || finishing.current) return;

    finishing.current = true;
    bootedThisVisit = true;
    loop.current?.kill();

    const leave = () => setVisible(false);

    if (reduced) {
      gsap.to(root.current, { autoAlpha: 0, duration: 0.25, onComplete: leave });

      return;
    }

    gsap
      .timeline({ onComplete: leave })
      .to(fill.current, { attr: { y: 18.6, height: 12.6 }, duration: 0.35, ease: 'power2.out' })
      .to(grain.current, { y: 8, scale: 0, duration: 0.3, ease: 'power2.in' }, '<')
      .to('[data-boot-mark]', { scale: 1.08, duration: 0.18, ease: 'power2.out' })
      .to('[data-boot-mark]', { scale: 1, duration: 0.3, ease: 'back.out(3)' })
      .to(
        '[data-boot-content]',
        { y: -14, autoAlpha: 0, duration: 0.3, ease: 'power2.in' },
        '+=0.05',
      )
      .to(
        root.current,
        { clipPath: 'inset(0 0 100% 0)', duration: 0.7, ease: 'expo.inOut' },
        '-=0.1',
      );
  }, [done, shown, reduced]);

  return (
    <>
      {children}

      {visible && shown && (
        <div
          ref={root}
          role="progressbar"
          aria-label={t(`loader.${phase}`)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(share * 100)}
          aria-busy={!done}
          className="fixed inset-0 z-[100] grid place-items-center bg-(--color-sidebar-ground) text-(--color-on-brand)"
          style={{ clipPath: 'inset(0 0 0% 0)' }}
        >
          <div
            data-boot-glow
            aria-hidden="true"
            className="pointer-events-none absolute size-[34rem] rounded-full bg-[radial-gradient(circle,rgb(227_176_75/0.16),rgb(227_176_75/0)_68%)] opacity-60"
          />

          <div data-boot-content className="relative flex flex-col items-center gap-5">
            <svg
              data-boot-mark
              aria-hidden="true"
              viewBox="0 0 32 32"
              width="104"
              height="104"
              fill="none"
            >
              <defs>
                <clipPath id={`bowl-${clipId}`}>
                  <path d="M28.6 18.6 A12.6 12.6 0 0 1 3.4 18.6 Z" />
                </clipPath>
              </defs>
              {/* The empty bowl, faint, so the fill reads as filling something. */}
              <path d="M28.6 18.6 A12.6 12.6 0 0 1 3.4 18.6 Z" fill="var(--sidebar-card)" />
              <path
                data-boot-rim
                d="M28.6 18.6 A12.6 12.6 0 0 1 3.4 18.6 Z"
                stroke="var(--sidebar-line)"
                strokeWidth="0.8"
                pathLength="1"
                strokeDasharray="1"
              />
              {/* The yield: gold rising with the real share of work done. */}
              <g clipPath={`url(#bowl-${clipId})`}>
                <rect
                  ref={fill}
                  x="3"
                  y="31.2"
                  width="26"
                  height="0"
                  fill="var(--accent-on-brand)"
                />
              </g>
              <path
                d="M3.4 18.6h25.2"
                stroke="var(--on-brand)"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
              <circle ref={grain} cx="21.5" cy="11.5" r="1.9" fill="var(--accent-on-brand)" />
            </svg>

            <span
              data-boot-word
              className="font-[family-name:var(--font-wordmark),var(--font-stack)] text-5xl leading-tight font-bold"
            >
              {t('common.appName')}
            </span>

            <div data-boot-status className="flex flex-col items-center gap-2.5">
              <div className="h-[3px] w-44 overflow-hidden rounded-full bg-(--color-sidebar-card)">
                <div
                  className="h-full origin-[right] rounded-full bg-(--color-accent-on-brand) transition-transform duration-500 ease-out ltr:origin-left"
                  style={{ transform: `scaleX(${share})` }}
                />
              </div>
              <p className="text-sm text-(--color-sidebar-text)">{t(`loader.${phase}`)}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
