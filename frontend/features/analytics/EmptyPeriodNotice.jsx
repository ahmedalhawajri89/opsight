'use client';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';
import { formatDate } from '@/lib/format';

/**
 * When the window is empty but the business is not.
 *
 * THE PROBLEM THIS SOLVES IS A LIE OF OMISSION. A period with no trade and a
 * business with no trade render identically — a column of zeros — and they
 * mean opposite things. Someone back from a quiet month, or opening the
 * application after a break, lands on an empty screen with nothing to say
 * where everything went. The figures are not wrong; the screen simply
 * declines to explain itself.
 *
 * So when the server says the business last traded outside the window on
 * screen, the dashboard says so and offers the month that has something in
 * it. Shown only when BOTH are true: this period is empty, and another one
 * is not. A business that has genuinely never traded sees nothing of this —
 * it has an onboarding story of its own, and being told "you last traded
 * never" helps no one.
 */
export function EmptyPeriodNotice({ latestActivityOn, onJump }) {
  const { t } = useI18n();

  if (!latestActivityOn) return null;

  const day = new Date(`${latestActivityOn}T00:00:00`);

  return (
    <div
      role="status"
      className="rise flex flex-wrap items-center gap-x-4 gap-y-3 rounded-(--radius-card) border border-(--color-info) bg-(--color-info-soft) px-4 py-3"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-(--radius-control) bg-(--color-surface) text-(--color-info)"
      >
        <Icon name="calendar" size={19} />
      </span>

      <p className="measure min-w-0 flex-1 text-sm text-(--color-text)">
        {t('dashboard.emptyPeriod.body', { date: formatDate(day) })}
      </p>

      <Button variant="secondary" size="sm" onClick={onJump}>
        {t('dashboard.emptyPeriod.action')}
      </Button>
    </div>
  );
}
