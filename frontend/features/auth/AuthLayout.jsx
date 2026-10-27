'use client';

import { gsap } from 'gsap';

import { AUTH_MOTION, toWords } from './authMotion';
import { LedgerScene } from '@/features/auth/LedgerScene';
import { useI18n } from '@/features/i18n/I18nProvider';
import { FocusColumn } from '@/components/layout/FocusColumn';
import { Logo } from '@/components/layout/Logo';
import { Icon } from '@/components/ui/Icon';
import { useGsap } from '@/hooks/useGsap';

/**
 * The frame shared by signing in and signing up.
 *
 * TWO HALVES, AND ONE OF THEM IS SOLID. The page that came before this was
 * two pale cards floating on a pale ground: nothing anchored the eye, the
 * brand colour appeared only inside one button, and half the height was
 * empty. A door seen for ten seconds by someone who does not yet know what
 * this product is has to say something in that time.
 *
 * So the end edge is a full-height panel of brand ink, and the task sits on
 * light ground beside it. This is the ONE page-sized wash of brand colour in
 * the product, and the exception is written into globals.css beside the rule
 * it breaks: a dashboard flooded with navy fights its own figures all day,
 * and a door has no figures of its own to fight.
 *
 * The form is at the START edge — the right in Arabic — because whoever
 * comes here comes to type, not to read. It is a bare column rather than a
 * card: with a solid panel beside it, a bordered box on the light side is
 * one frame too many.
 *
 * THE FORM DOES NOT WAIT FOR THE SHOW. The task is done inside a third of a
 * second and the panel's argument unfolds afterwards. GSAP moves transforms
 * and opacity only, so a field takes a click and a keystroke mid-flight. The
 * fields are animated by the form itself, which knows when they exist
 * (useFieldEntrance).
 *
 * The headline arrives word by word — never letter by letter. Arabic letters
 * change shape according to their neighbours, so a word split into
 * per-character spans renders as disconnected isolated forms, and the first
 * sentence a reader meets would be subtly wrong in one of the two languages
 * (authMotion.js).
 *
 * The two panes carry view-transition names, so switching language lets them
 * glide to their mirrored sides instead of jumping (globals.css, "Language
 * transition").
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
    <main ref={root} className="grid min-h-dvh bg-(--color-ground) lg:grid-cols-[46fr_54fr]">
      {/* ---- The task ---------------------------------------------------- */}
      <section className="order-2 flex flex-col px-6 pb-12 sm:px-8 lg:order-1 lg:py-10 [view-transition-name:login-form]">
        {/*
          Before sign-in there is no account to save to, so this switches the
          page and is remembered in a cookie; the choice stored on the account
          takes over once the reader signs in. It names the language it will
          switch TO, in that language's own script.
        */}
        <FocusColumn className="flex justify-end pt-6 lg:pt-0">
          <button
            type="button"
            onClick={() => setPreferences({ locale: other })}
            aria-label={t('login.switchLanguage', { language: otherName })}
            className="inline-flex h-10 items-center gap-2 rounded-(--radius-control) px-3 text-sm font-medium text-(--color-text-2) transition-colors duration-(--duration-fast) hover:bg-(--color-surface-hover) hover:text-(--color-text)"
          >
            <Icon name="globe" size={15} />
            <span lang={other}>{otherName}</span>
          </button>
        </FocusColumn>

        <FocusColumn className="flex flex-1 flex-col justify-center py-10">
          <div data-auth-rise>
            <h1 className="text-3xl font-semibold tracking-tight text-(--color-text)">{title}</h1>
            <p className="measure mt-2 text-base text-(--color-text-2)">{subtitle}</p>

            <div className="mt-8">{children}</div>
          </div>

          {footer}
        </FocusColumn>
      </section>

      {/* ---- What it is -------------------------------------------------- */}
      {/*
        Full-bleed to three edges, with no radius and no margin. A rounded
        card here would read as a picture OF the product placed on a page;
        running it to the edge makes it the page's own spine.

        The gradient stays inside one hue — ink to deeper ink. A second hue
        would be the launch-page wash this palette spent a version removing.
      */}
      <section className="order-1 flex flex-col justify-between bg-[linear-gradient(180deg,var(--color-brand-panel),var(--color-brand-panel-deep))] px-6 py-10 text-(--color-on-brand) sm:px-10 lg:order-2 lg:px-14 lg:py-12 [view-transition-name:login-scene]">
        <Logo tone="onBrand" />

        <div className="mt-10 lg:mt-0">
          {/*
            One <p> with the words wrapped, not a list: it is a sentence, and
            a screen reader must still read it as one. The inner span is what
            moves; the outer clips it, so each word rises out of the line
            rather than sliding over the one above.
          */}
          <p className="max-w-2xl text-3xl leading-[1.25] font-semibold text-balance lg:text-[2.6rem]">
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

          <p className="measure mt-5 text-lg text-(--color-on-brand-2)">{t('common.tagline')}</p>
        </div>

        {/*
          The scene is the argument, so it is given the foot of the panel
          rather than squeezed under the text. Below lg it goes entirely:
          on a phone the panel is a band above the form, and a band is no
          place for a three-beat story nobody will scroll back to.
        */}
        <div className="hidden lg:block">
          <LedgerScene />
        </div>
      </section>
    </main>
  );
}
