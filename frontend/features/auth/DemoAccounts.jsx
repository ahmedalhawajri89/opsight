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
const ACCOUNTS = [
  { email: 'owner@opsight.test', role: 'owner' },
  { email: 'manager@opsight.test', role: 'manager' },
  { email: 'analyst@opsight.test', role: 'analyst' },
  { email: 'staff@opsight.test', role: 'staff' },
  { email: 'owner@alnoor.test', role: 'owner', second: true },
];

/**
 * One-click sign-in for the public demo, shown only where
 * NEXT_PUBLIC_DEMO_MODE is set (docs/DEPLOYMENT.md).
 *
 * A visitor who came from a portfolio wants to see the product, not guess a
 * password. Each role is offered by name because the difference between them
 * is the point: the Staff view and the Owner view are not the same Opsight,
 * and the server, not the browser, decides which is which.
 */
export function DemoAccounts() {
  const { login } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return null;

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

  return (
    <section
      aria-labelledby="demo-title"
      className="mb-6 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-subtle) p-4"
    >
      <h2 id="demo-title" className="text-sm font-semibold text-(--color-text)">
        {t('demo.title')}
      </h2>
      <p className="measure mt-1 text-sm text-(--color-muted)">{t('demo.body')}</p>

      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-(--color-danger)">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {ACCOUNTS.map((account) => (
          <li key={account.email} className={account.second ? 'sm:col-span-2' : undefined}>
            <button
              type="button"
              onClick={() => signIn(account)}
              disabled={pending !== null}
              className="flex h-11 w-full items-center justify-between gap-3 rounded-(--radius-control) border border-(--color-line-strong) bg-(--color-surface) px-4 text-start text-sm font-medium text-(--color-text) transition-colors duration-(--duration-fast) hover:border-(--color-brand) disabled:opacity-60"
            >
              <span>
                {account.second ? t('demo.secondBusiness') : t(`roles.${account.role}`)}
              </span>
              <span className="shrink-0 whitespace-nowrap text-(--color-muted)">
                {pending === account.email ? t('auth.signingIn') : t('demo.signIn')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
