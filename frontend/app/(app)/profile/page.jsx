'use client';

import { useAuth } from '@/features/auth/AuthProvider';
import { ChangePasswordCard } from '@/features/auth/ChangePasswordCard';
import { useI18n } from '@/features/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Card, PageHeader } from '@/components/layout/PageHeader';
import { formatDateTime } from '@/lib/format';

/**
 * The signed-in user's own account.
 *
 * Name, email and role are shown but not edited here: they are administration,
 * and an Owner owns them (ROLES_AND_PERMISSIONS.md §3.3). What belongs to the
 * person rather than the business — their password, their language — is
 * theirs to change, and the language lives in the top bar where it is needed
 * on every screen.
 */
export default function ProfilePage() {
  const { user } = useAuth();
  const { t } = useI18n();

  if (!user) return null;

  return (
    <div className="space-y-4">
      <PageHeader title={t('profile.title')} description={t('profile.description')} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t('profile.account')} className="lg:col-span-1">
          <dl className="space-y-2.5 text-base">
            <Row label={t('profile.name')} value={user.name} />
            <Row label={t('auth.email')} value={<bdi dir="ltr">{user.email}</bdi>} />
            <Row label={t('filters.role')} value={<Badge tone="accent">{user.role_label}</Badge>} />
            <Row label={t('profile.business')} value={user.business?.name} />
            <Row
              label={t('users.columns.lastSignedIn')}
              value={user.last_login_at ? formatDateTime(user.last_login_at) : '—'}
            />
          </dl>

          <p className="mt-4 text-sm text-(--color-muted)">{t('profile.adminNote')}</p>
        </Card>

        <div className="lg:col-span-2">
          <ChangePasswordCard />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-(--color-text-2)">{label}</dt>
      <dd className="text-end text-(--color-text)">{value ?? '—'}</dd>
    </div>
  );
}
