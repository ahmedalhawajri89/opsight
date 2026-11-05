'use client';

import { gsap } from 'gsap';

import { AUTH_MOTION, toWords } from './authMotion';
import { AuthField } from './AuthField';
import { useI18n } from '@/features/i18n/I18nProvider';
import { Logo } from '@/components/layout/Logo';
import { Icon } from '@/components/ui/Icon';
import { useGsap } from '@/hooks/useGsap';

/**
 * The frame shared by signing in and signing up: one screen, one field.
 *
 * TWO LAYOUTS CAME BEFORE THIS. The first was two panes — the form on light
 * ground, a panel of brand ink beside it — which is the front door of almost
 * every business product: Stripe, Linear, Notion, Vercel. The second was a
 * ledger sheet, which escaped that shape but scrolled, and a page that
 * scrolls before anyone has typed anything is a page that did not decide what
 * mattered.
 *
 * This one fills the viewport exactly and never scrolls. The field behind it
 * is the product's own argument at wallpaper scale (AuthField), and the form
 * stands in a clearing at the centre of it.
 *
 * HOW NOTHING SCROLLS, AND WHY THE INNER COLUMN STILL CAN.
 *
 * `h-dvh` + `overflow-hidden` on this element means the page itself has no
 * scrollbar at any size — that is the whole point. But a 360px phone with the
 * keyboard open has perhaps 300px of usable height, and clipping a password
 * field out of reach is worse than a scrollbar. So the inner column carries
 * `overflow-y-auto`: at every ordinary size it never engages, and in the one
 * case where the form genuinely cannot fit it is still reachable.
 *
 * ONE `h1`, AND IT IS THE FORM'S TITLE. The font test reads the FIRST `h1` in
 * the document and asserts it is drawn in IBM Plex Sans Arabic rather than a
 * system fallback (e2e/i18n.spec.js). A headline promoted to `h1` for visual
 * weight would silently move that assertion onto the wrong element. The
 * sentence above the form is a `<p>` that happens to be large.
 *
 * THE FORM STAYS ON LIGHT FIELDS, ON PURPOSE. Everything else here is ink,
 * but the inputs keep `--color-surface`. A browser paints its own background
 * into an autofilled field and cannot be overridden from the page, so a
 * transparent input on ink arrives as a pale rectangle the moment a password
 * manager fills it. Labels and helper text take the on-brand tokens instead
 * (formStyles.js).
 *
 * The headline arrives word by word — never letter by letter. Arabic letters
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
        .from(q('[data-auth-rise]'), { ...AUTH_MOTION.card, opacity: 0, y: 12 })
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
        The clearing. `max-h-dvh` with its own scroll is the safety valve
        described above; `py-12` keeps a focused field's ring — which sits
        2px outside its border — clear of the column's own clipped edge.
      */}
      <div className="relative z-10 max-h-dvh w-full max-w-110 overflow-y-auto px-5 py-12 [@media(max-height:660px)]:py-5">
        {/*
          The scrim, and it is the column’s shape rather than the screen’s.

          This began as a radial clearing sized to the viewport — 44% by 48%
          of it — which is a shape the content column never has. Audited
          across ten sizes, the submit button, the remember row and both
          footer links were sitting on the figure’s columns at almost every
          one of them. A mask for text has to be measured from the text.

          Tied to the column with negative insets, it covers whatever the
          column turns out to be at any width, and feathers out so it reads
          as the page darkening behind the form rather than as a card on
          top of it.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-10 -inset-y-8 -z-10 bg-[radial-gradient(ellipse_at_center,rgb(8_22_38/0.92)_0%,rgb(8_22_38/0.88)_55%,transparent_88%)]"
        />

        <div data-auth-rise>
          <Logo tone="onBrand" />

          {/*
            Large, and still a paragraph. See the note about the first `h1`.
            It goes on a short screen: at that height the form is the page,
            and a sentence above it would push the submit button off. The threshold is
            740px because 720 is where the inner column first had to scroll
            — and 720 is also the height the browser suite runs at.
          */}
          <p className="mt-7 text-xl leading-[1.35] font-semibold text-balance text-(--color-on-brand) sm:text-2xl [@media(max-height:740px)]:hidden">
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

          <div className="mt-8 border-t border-(--color-on-brand-line)/30 pt-7 [@media(max-height:660px)]:mt-5 [@media(max-height:660px)]:pt-5">
            <h1 className="text-xl font-semibold tracking-tight text-(--color-on-brand)">
              {title}
            </h1>
            <p className="measure mt-1.5 text-base text-(--color-on-brand-2)">{subtitle}</p>

            <div className="mt-7">{children}</div>
          </div>
        </div>

        {footer}
      </div>
    </main>
  );
}
