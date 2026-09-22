'use client';

import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';

import { AUTH_QUERY_KEY, useAuth } from '@/features/auth/AuthProvider';
import { setRequestLanguage } from '@/lib/apiClient';
import { setFormatLocale } from '@/lib/format';
import {
  LOCALE_COOKIE,
  NUMERALS_COOKIE,
  directionOf,
  intlTag,
  normaliseLocale,
  normaliseNumerals,
} from '@/lib/i18n/config';
import { createTranslator, splitTags } from '@/lib/i18n/translate';
import en from '@/lib/i18n/messages/en';
import ar from '@/lib/i18n/messages/ar';
import * as authService from '@/services/auth';

const DICTIONARIES = { en, ar };

const I18nContext = createContext(null);

/*
 * Resolves once <html lang> reads the new language — that is, once React has
 * committed it and the layout effect below has written it. Polled on a timer,
 * not requestAnimationFrame: while a view transition's update callback is
 * pending the browser suppresses rendering, and animation frames with it.
 * Capped, so a failure can never leave the page frozen mid-transition.
 */
function whenLanguageApplied(locale, timeout = 800) {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      if (document.documentElement.lang === locale || Date.now() - started > timeout) resolve();
      else setTimeout(check, 16);
    };
    check();
  });
}

/**
 * Switches language inside a native View Transition, so the page MIRRORS
 * rather than jumps: the named panes glide to their opposite sides and the
 * text crossfades (globals.css, "Language transition").
 *
 * The browser snapshots the page, runs `apply`, waits for the returned promise,
 * snapshots again and animates between the two. So the promise must not settle
 * until the new direction is really in the DOM — for a guest `flushSync` gets
 * it there at once, but a signed-in user's language arrives through React
 * Query, which notifies its subscribers asynchronously.
 *
 * Without the API, under reduced motion, or when nothing would change, the
 * switch is simply applied — the behaviour before this existed.
 */
function runLanguageTransition(nextLocale, apply) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (
    typeof document.startViewTransition !== 'function' ||
    reduced ||
    document.documentElement.lang === nextLocale
  ) {
    apply();

    return;
  }

  document.startViewTransition(async () => {
    flushSync(apply);
    await whenLanguageApplied(nextLocale);
  });
}

/**
 * The active language, for every component and every formatter.
 *
 * WHERE THE LANGUAGE COMES FROM
 *   Signed in  → the user's saved preference, from /me. The account is the
 *                authority, so the choice follows the person between devices.
 *   Signed out → a cookie remembered from the last visit, so the sign-in page
 *                opens in the language its reader last used.
 *
 * WHAT CHANGING IT DOES
 *   Four things move together, because any one lagging behind the others is a
 *   visible defect: the dictionary, the Intl locale every figure is formatted
 *   in, <html lang dir> (layout direction and screen-reader pronunciation), and
 *   the Accept-Language the API client sends — so sentences the SERVER writes,
 *   such as insights and validation errors, arrive in the same language.
 *
 * The subtree is remounted when the language changes (the keyed Fragment
 * below). Formatters read the active locale when they run, so a component
 * holding a figure formatted a moment ago would otherwise keep showing it in
 * the old language. Changing language is rare and deliberate; a remount is the
 * honest price of every figure on screen being right afterwards.
 */
export function I18nProvider({ initialLocale, initialNumerals, children }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [guest, setGuest] = useState(() => ({
    locale: normaliseLocale(initialLocale),
    numerals: normaliseNumerals(initialLocale, initialNumerals),
  }));

  const locale = user ? normaliseLocale(user.locale) : guest.locale;
  const numerals = user ? normaliseNumerals(locale, user.numerals) : guest.numerals;
  const dir = directionOf(locale);
  const tag = intlTag(locale, numerals);

  const messages = DICTIONARIES[locale];

  /*
   * Applied during render, before any child formats a figure. Both calls are
   * idempotent assignments to module state, not React state updates, so doing
   * this in render is safe and avoids one frame of figures in the old locale.
   */
  setFormatLocale(tag, { points: messages.format.pointsUnit });
  setRequestLanguage(locale);

  /*
   * A layout effect, not a passive one: it runs inside the commit, so when a
   * language transition takes its "after" snapshot the direction is already
   * the new one, and the panes glide instead of arriving on the wrong side.
   */
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;

    // A year, SameSite=Lax, readable by the server layout on the next load.
    // Not HttpOnly by design: it holds a display preference, nothing secret.
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${maxAge}; samesite=lax`;
    document.cookie = `${NUMERALS_COOKIE}=${numerals}; path=/; max-age=${maxAge}; samesite=lax`;
  }, [locale, numerals, dir]);

  const t = useMemo(
    () =>
      createTranslator({
        messages,
        fallback: en,
        intlLocale: tag,
        formatCount: (count) => new Intl.NumberFormat(tag).format(count),
        onMissing: (key) => {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`[i18n] Missing translation: ${key}`);
          }
        },
      }),
    [messages, tag],
  );

  const setPreferences = useCallback(
    async (next) => {
      const nextLocale = normaliseLocale(next.locale ?? locale);
      const nextNumerals = normaliseNumerals(nextLocale, next.numerals ?? numerals);

      if (!user) {
        runLanguageTransition(nextLocale, () =>
          setGuest({ locale: nextLocale, numerals: nextNumerals }),
        );

        return;
      }

      // Saved first: the page only turns around once the account agrees.
      const response = await authService.updatePreferences({
        locale: nextLocale,
        numerals: nextNumerals,
      });

      runLanguageTransition(nextLocale, () =>
        queryClient.setQueryData(AUTH_QUERY_KEY, response.data),
      );

      /*
       * Everything else was fetched in the previous language: insight
       * sentences, comparison labels, role names, empty-value reasons. Refetch
       * it all rather than enumerate which endpoints write text — a list that
       * would be silently incomplete the day an endpoint starts to.
       */
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== AUTH_QUERY_KEY[0],
      });
    },
    [user, locale, numerals, queryClient],
  );

  const value = useMemo(
    () => ({ locale, numerals, dir, tag, t, setPreferences }),
    [locale, numerals, dir, tag, t, setPreferences],
  );

  return (
    <I18nContext.Provider value={value}>
      <Fragment key={tag}>{children}</Fragment>
    </I18nContext.Provider>
  );
}

/*
 * English, for a component rendered outside the provider — a unit test, the
 * component gallery, a storybook-style harness. Throwing instead would force
 * every isolated render to stand up auth and a query client just to read a
 * label, and English is exactly what the application renders by default anyway.
 */
const STANDALONE = {
  locale: 'en',
  numerals: 'latn',
  dir: 'ltr',
  tag: 'en-GB',
  t: createTranslator({ messages: en, fallback: en, intlLocale: 'en-GB' }),
  setPreferences: async () => {},
};

export function useI18n() {
  return useContext(I18nContext) ?? STANDALONE;
}

/**
 * A translated sentence with emphasised runs.
 *
 *   <Trans k="analytics.help.cost" tags={{ strong: (text) => <strong>{text}</strong> }} />
 *
 * The translator decides where the emphasis falls in their own word order,
 * which a sentence stitched together from three translated fragments would not
 * allow — Arabic rarely puts the emphasised phrase where English does.
 */
export function Trans({ k, params, tags = {} }) {
  const { t } = useI18n();

  return splitTags(t(k, params)).map((part, index) => {
    if (typeof part === 'string') return <Fragment key={index}>{part}</Fragment>;

    const render = tags[part.tag];

    return <Fragment key={index}>{render ? render(part.text) : part.text}</Fragment>;
  });
}
