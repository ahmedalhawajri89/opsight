'use client';

import { gsap } from 'gsap';

import { AUTH_MOTION, toWords } from './authMotion';
import { WarehouseScene } from './WarehouseScene';
import { useI18n } from '@/features/i18n/I18nProvider';
import { Icon } from '@/components/ui/Icon';
import { useGsap } from '@/hooks/useGsap';

/**
 * The ink half of the door: what this product is, said once, beside the form.
 *
 * THE CURVE. The panel's edge facing the form is a drawn curve with a band of
 * the accent showing behind it, rather than a straight split. A straight
 * split is two pages pushed together; the curve makes the ink and the card
 * one composition. The shape is an SVG stretched to the panel
 * (`preserveAspectRatio="none"`), so it is the same curve at every size, and
 * it is drawn for a panel standing at the END of the line: in Arabic that is
 * the left, so the drawing is mirrored there.
 *
 * NO `h1` HERE. The first `h1` on the page is the card's title, and the font
 * test reads the first `h1` to prove the Arabic face loaded
 * (e2e/i18n.spec.js). The welcome is a paragraph that looks like a headline.
 *
 * The three claims are what Baydar actually does, not adjectives: stock is
 * moved by recorded movements, every figure is computed from the records,
 * and each business is walled off from every other (ADR-023).
 *
 * Hidden below `lg`: on a phone the card is the page.
 */
const FEATURES = [
  { icon: 'bolt', title: 'login.featureLiveTitle', body: 'login.featureLiveBody' },
  { icon: 'fileChart', title: 'login.featureExactTitle', body: 'login.featureExactBody' },
  { icon: 'shield', title: 'login.featureIsolatedTitle', body: 'login.featureIsolatedBody' },
];

export function AuthHero() {
  const { t, locale } = useI18n();

  /*
   * Re-keyed on the locale: switching language replaces every word node, and
   * a timeline still holding the old ones would animate elements that are no
   * longer on the page.
   */
  const root = useGsap(
    (self) => {
      const q = self.selector;

      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from(q('[data-hero-band]'), { xPercent: 6, opacity: 0, duration: 0.9 })
        .from(q('[data-hero-ink]'), { xPercent: 4, opacity: 0, duration: 0.8 }, 0.08)
        .from(q('[data-hero-word]'), { ...AUTH_MOTION.word, opacity: 0, yPercent: 110 }, 0.3)
        .from(q('[data-hero-line]'), { opacity: 0, y: 12, duration: 0.6 }, '-=0.3')
        .from(q('[data-hero-feature]'), { opacity: 0, y: 16, duration: 0.5, stagger: 0.1 }, '-=0.3')
        .from(q('[data-hero-rule]'), { scaleY: 0, duration: 0.5, stagger: 0.1 }, '<0.1');
    },
    [locale],
  );

  return (
    <aside
      ref={root}
      data-auth-hero
      className="relative hidden overflow-hidden lg:flex lg:flex-col"
      aria-label={t('login.heroLabel', { name: t('common.appName') })}
    >
      {/* The shape: a band of accent, and the ink laid over it. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full rtl:-scale-x-100"
        focusable="false"
      >
        <defs>
          <linearGradient id="hero-ink" x1="0" x2="0.4" y1="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--color-brand-panel)' }} />
            <stop offset="1" style={{ stopColor: 'var(--color-brand-panel-deep)' }} />
          </linearGradient>
        </defs>
        <path
          data-hero-band
          d="M10 0H100V100H1.5C9 84 -1.5 66 4.5 47C10 30 2 13 10 0Z"
          className="fill-(--color-accent-on-brand)"
        />
        <path
          data-hero-ink
          d="M13 0H100V100H4.5C12 84 1.5 66 7.5 47C13 30 5 13 13 0Z"
          fill="url(#hero-ink)"
        />
      </svg>

      {/* A faint dot grid on the ink, gathered towards the scene. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(var(--color-on-brand-line)_1px,transparent_1px)] bg-size-[22px_22px] opacity-[0.14] [mask-image:radial-gradient(ellipse_70%_60%_at_65%_70%,black,transparent)]"
      />

      <div className="relative flex min-h-0 flex-1 flex-col ps-[15%] pe-12 pt-24 pb-10 xl:pe-16">
        <div className="max-w-xl">
          <p className="text-4xl leading-tight font-bold text-(--color-on-brand) 2xl:text-5xl 2xl:leading-tight">
            <Words text={t('login.welcome', { name: t('common.appName') })} />
            <span className="block text-(--color-accent-on-brand)">
              <Words text={t('login.welcomeAccent')} />
            </span>
          </p>
          <p
            data-hero-line
            className="measure mt-5 text-lg leading-relaxed text-(--color-on-brand-2)"
          >
            {t('login.headline')}
          </p>
        </div>

        <WarehouseScene className="relative -me-6 mt-4 min-h-0 flex-1" />

        <ul className="mt-6 grid max-w-2xl shrink-0 grid-cols-3">
          {FEATURES.map((feature, index) => (
            <li key={feature.icon} className="relative flex gap-3 px-4 first:ps-0">
              {index > 0 && (
                <span
                  data-hero-rule
                  aria-hidden="true"
                  className="absolute inset-y-1 start-0 w-px origin-top bg-(--color-on-brand-line)/35"
                />
              )}
              <span data-hero-feature className="flex gap-3">
                <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-(--radius-control) bg-(--color-accent-on-brand)/15 text-(--color-accent-on-brand)">
                  <Icon name={feature.icon} size={18} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-(--color-on-brand)">
                    {t(feature.title)}
                  </span>
                  <span className="mt-0.5 block text-sm leading-snug text-(--color-on-brand-2)">
                    {t(feature.body)}
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

/**
 * A line, word by word — never letter by letter. Arabic letters change shape
 * according to their neighbours, and per-character spans would render them as
 * disconnected isolated forms (authMotion.js).
 */
function Words({ text }) {
  return toWords(text).map((word, index) =>
    word.trim() === '' ? (
      word
    ) : (
      <span key={index} className="inline-block overflow-hidden pb-1 align-bottom">
        <span data-hero-word className="inline-block">
          {word}
        </span>
      </span>
    ),
  );
}
