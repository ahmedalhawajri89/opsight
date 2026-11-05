'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from './AuthProvider';
import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';

/*
 * The public demo's accounts, one per role plus the second business's owner,
 * as they are seeded on the server (config/demo.php). Their password is
 * printed in the README; on the demo it is a fact about the demo, not a secret.
 */
const PASSWORD = 'password';

/** The one almost everybody wants, kept apart from the rest on purpose. */
const PRIMARY = { email: 'owner@opsight.test', role: 'owner' };

const OTHERS = [
  { email: 'manager@opsight.test', role: 'manager' },
  { email: 'analyst@opsight.test', role: 'analyst' },
  { email: 'staff@opsight.test', role: 'staff' },
  { email: 'owner@alnoor.test', role: 'owner', second: true },
];

/** Whether this build is the public demo. Inlined by Next at build time. */
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

/**
 * One-click sign-in for the public demo, shown only where
 * NEXT_PUBLIC_DEMO_MODE is set (docs/DEPLOYMENT.md).
 *
 * A visitor who came from a portfolio wants to see the product, not guess a
 * password. Each role is offered by name because the difference between them
 * is the point: the Staff view and the Owner view are not the same Baydar,
 * and the server, not the browser, decides which is which.
 *
 * ONE DOOR IS WIDER THAN THE OTHERS. This used to be five equal buttons in a
 * bordered box, each repeating the words "Sign in", above a full email form —
 * two complete paths competing for the same visitor, and no answer to "which
 * one should I press?". Almost everyone arriving from a portfolio wants the
 * owner's view, because it is the only one that can see cost and margin. So
 * the owner is the page's primary action and the other four are a quiet row
 * beneath it, named by role alone: the repeated verb carried no information
 * once the first button had said it.
 *
 * The email form is not gone, only folded away behind a disclosure, and only
 * here — a build that is not the demo has no shortcuts to compete with it and
 * shows the form directly (login/page.jsx).
 */
export function DemoAccounts() {
  const { login } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);

  if (!IS_DEMO) return null;

  async function signIn(account) {
    setError(null);
    setPending(account.email);

    try {
      await login({ email: account.email, password: PASSWORD, remember: false });
      router.replace('/dashboard');
    } catch (failure) {
      setError(failure.message);
      setPending(null);
    }
  }

  const busy = pending !== null;

  /*
   * Two names per account, because the chip and the screen reader need
   * different lengths. "Owner of a second business, in Kuwaiti dinars" is the
   * useful sentence and a hopeless button label; "Second business" is the
   * label and tells a listener nothing about why it is there.
   */
  const nameOf = (account) =>
    account.second ? t('demo.secondBusinessShort') : t(`roles.${account.role}`);
  const fullNameOf = (account) =>
    account.second ? t('demo.secondBusiness') : t(`roles.${account.role}`);

  return (
    <section aria-labelledby="demo-title" className="mb-7">
      <h2 id="demo-title" className="text-sm font-semibold text-(--color-on-brand)">
        {t('demo.title')}
      </h2>
      <p className="measure mt-1 text-sm text-(--color-on-brand-2)">{t('demo.body')}</p>

      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-(--color-danger)">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {/*
        The primary action of the whole page, and it looks like one: the same
        height and weight as the real submit button below, so the eye does not
        have to decide which of two sign-ins is the sign-in.
      */}
      <button
        type="button"
        onClick={() => signIn(PRIMARY)}
        disabled={busy}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-(--radius-control) bg-(--color-on-brand) px-4 text-sm font-semibold text-(--color-brand-panel) transition-colors duration-(--duration-fast) hover:bg-(--color-on-brand-2) disabled:opacity-60"
      >
        {pending === PRIMARY.email ? t('auth.signingIn') : t('demo.enterAsOwner')}
        {!busy && <Icon name="arrowRight" size={16} className="rtl:-scale-x-100" />}
      </button>

      <p className="mt-4 text-sm text-(--color-on-brand-2)">{t('demo.orAnotherRole')}</p>

      {/*
        A row of four, not a grid of equals: these are alternatives to the
        action above, and they are sized like alternatives.
      */}
      <ul className="mt-2 flex flex-wrap gap-2">
        {OTHERS.map((account) => (
          <li key={account.email}>
            <button
              type="button"
              onClick={() => signIn(account)}
              disabled={busy}
              /*
               * The visible text is the role alone; the accessible name says
               * what pressing it does. A screen reader hearing "Manager"
               * learns nothing about whether it is a button that signs in or
               * a label on something else.
               */
              aria-label={t('demo.signInAs', { role: fullNameOf(account) })}
              className="inline-flex h-9 items-center rounded-(--radius-control) border border-(--color-on-brand-line)/45 px-3 text-sm font-medium text-(--color-on-brand-2) transition-colors duration-(--duration-fast) hover:border-(--color-on-brand) hover:text-(--color-on-brand) disabled:opacity-60"
            >
              {pending === account.email ? t('auth.signingIn') : nameOf(account)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
