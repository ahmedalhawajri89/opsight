'use client';

import { gsap } from 'gsap';

import { AUTH_MOTION, toWords } from './authMotion';
import { AuthField } from './AuthField';
import { useI18n } from '@/features/i18n/I18nProvider';
import { Logo } from '@/components/layout/Logo';
import { Icon } from '@/components/ui/Icon';
import { useGsap } from '@/hooks/useGsap';

/**
 * The frame shared by signing in and signing up: one screen, one card.
 *
 * THREE LAYOUTS CAME BEFORE THIS. The first was two panes — the form on light
 * ground, a panel of brand ink beside it — which is the front door of almost
 * every business product: Stripe, Linear, Notion, Vercel. The second was a
 * ledger sheet, which escaped that shape but scrolled, and a page that
 * scrolls before anyone has typed anything is a page that did not decide what
 * mattered. The third filled the viewport with ink and stood the form in a
 * clearing in the middle of it, with no container at all.
 *
 * That third one measured clean — nothing scrolled at any size, every pair
 * passed contrast against rendered pixels, every target was reachable — and
 * it still read as unfinished, for two reasons a measurement cannot see.
 *
 * A FORM NEEDS AN EDGE. Fields floating on a dark ground behind a soft radial
 * shadow do not read as a panel; they read as a panel that failed to paint.
 * The card here is an opaque surface one step lighter than the ink
 * (`--on-brand-raise`), with a hairline and a deep shadow. It is the one card
 * in the product that carries both: the rule against that was written for
 * white cards on an off-white page, where a border and a shadow say the same
 * thing twice. On ink they say different things — the hairline is where the
 * surface ends, the shadow is how far it stands off the ground.
 *
 * AND THE ACTION MUST OUTRANK THE FIELDS. The submit button used to be white,
 * the same white as the two inputs above it and the same height, so nothing
 * on the card said which of the three was the thing to press. It is the
 * accent now — the only saturated colour on the screen (formStyles.js).
 *
 * The wordmark and the sentence stand ABOVE the card rather than inside it,
 * which is what lets the card hold nothing but the task.
 *
 * HOW NOTHING SCROLLS, AND WHY THE COLUMN STILL CAN.
 *
 * `h-dvh` + `overflow-hidden` on this element means the page itself has no
 * scrollbar at any size — that is the whole point. But a 360px phone with the
 * keyboard open has perhaps 300px of usable height, and clipping a password
 * field out of reach is worse than a scrollbar. So the column inside carries
 * `overflow-y-auto`: at every ordinary size it never engages, and in the one
 * case where the form genuinely cannot fit it is still reachable.
 *
 * ONE `h1`, AND IT IS THE FORM'S TITLE. The font test reads the FIRST `h1` in
 * the document and asserts it is drawn in IBM Plex Sans Arabic rather than a
 * system fallback (e2e/i18n.spec.js). A sentence promoted to `h1` for visual
 * weight would silently move that assertion onto the wrong element. The
 * sentence above the card is a `<p>`.
 *
 * THE FIELDS STAY ON LIGHT, ON PURPOSE. Everything else here is ink, but the
 * inputs keep `--color-surface`. A browser paints its own background into an
 * autofilled field and cannot be overridden from the page, so a transparent
 * input on ink arrives as a pale rectangle the moment a password manager
 * fills it. Labels and helper text take the on-brand tokens instead.
 *
 * The sentence arrives word by word — never letter by letter. Arabic letters
 * change shape according to their neighbours, so a word split into
 * per-character spans renders as disconnected isolated forms, and the first
 * sentence a reader meets would be subtly wrong in one of the two languages
 * (authMotion.js).
 */
export function AuthLayout({ title, subtitle, children, footer }) {
  const { t, locale, setPreferences } = useI18n();

  const other = locale === 'ar' ? 'en' : 'ar';
  const otherName = locale === 'ar' ? 'English' : 'العربية';

  /*
   * Re-keyed on the locale: switching language replaces every word node, and
   * a timeline still holding the old ones would animate elements that are no
   * longer on the page while the new sentence sat at its start state.
   */
  const root = useGsap(
    (self) => {
      const q = self.selector;

      gsap
        .timeline()
        .from(q('[data-auth-rise]'), { ...AUTH_MOTION.card, opacity: 0, y: 14 })
        .from(
          q('[data-auth-word]'),
          { ...AUTH_MOTION.word, opacity: 0, yPercent: 110 },
          AUTH_MOTION.card.duration * 0.25,
        );
    },
    [locale],
  );

  return (
    <main
      ref={root}
      className="relative grid h-dvh place-items-center overflow-hidden bg-[linear-gradient(165deg,var(--color-brand-panel),var(--color-brand-panel-deep))] [view-transition-name:login-form]"
    >
      <AuthField />

      {/*
        Before sign-in there is no account to save to, so this switches the
        page and is remembered in a cookie; the choice stored on the account
        takes over once the reader signs in. It names the language it will
        switch TO, in that language's own script.
      */}
      <button
        type="button"
        onClick={() => setPreferences({ locale: other })}
        aria-label={t('login.switchLanguage', { language: otherName })}
        className="absolute top-4 end-4 z-20 inline-flex h-11 items-center gap-2 rounded-(--radius-control) px-3 text-sm font-medium text-(--color-on-brand-2) transition-colors duration-(--duration-fast) hover:bg-(--color-on-brand)/10 hover:text-(--color-on-brand) md:h-9"
      >
        <Icon name="globe" size={15} />
        <span lang={other}>{otherName}</span>
      </button>

      {/*
        The column. `max-h-dvh` with its own scroll is the safety valve
        described above; the vertical padding also keeps a focused field's
        ring — which sits 2px outside its border — clear of the column's own
        clipped edge.
      */}
      <div className="relative z-10 max-h-dvh w-full max-w-116 overflow-y-auto px-5 py-10 [@media(max-height:680px)]:py-4">
        <div data-auth-rise>
          <div className="flex flex-col items-center text-center">
            <Logo tone="onBrand" />

            {/*
              The thesis, and still a paragraph. See the note about the first
              `h1`. It goes on a short screen: at that height the card is the
              page, and a sentence above it would push the submit button off.
              The threshold is 740px because 720 is where the column first had
              to scroll — and 720 is also the height the browser suite runs at.
            */}
            <p className="measure mt-5 text-base leading-relaxed text-balance text-(--color-on-brand-2) [@media(max-height:740px)]:hidden">
              {toWords(t('login.headline')).map((word, index) =>
                word.trim() === '' ? (
                  word
                ) : (
                  <span key={index} className="inline-block overflow-hidden align-bottom">
                    <span data-auth-word className="inline-block">
                      {word}
                    </span>
                  </span>
                ),
              )}
            </p>
          </div>

          {/* The card: nothing in it but the task. */}
          <section className="mt-7 rounded-(--radius-card) border border-(--color-on-brand-line)/25 bg-(--color-on-brand-raise) p-6 shadow-(--shadow-ink) sm:p-7 [@media(max-height:680px)]:mt-4">
            <h1 className="text-xl font-semibold tracking-tight text-(--color-on-brand)">
              {title}
            </h1>
            <p className="mt-1.5 text-base text-(--color-on-brand-2)">{subtitle}</p>

            <div className="mt-6">{children}</div>
          </section>

          {/* Links out: below the card, because they are not the task. */}
          <div className="mt-5 text-center">{footer}</div>
        </div>
      </div>
    </main>
  );
}
