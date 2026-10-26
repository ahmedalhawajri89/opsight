'use client';

import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * Telling a reader once that focus mode exists.
 *
 * A feature nobody finds was not built. Focus mode lives behind an icon and
 * a shortcut in a tooltip — which is to say, behind two things a reader has
 * to already suspect are there. One sentence, once, is the cost of it being
 * used at all.
 *
 * NOT a coach mark pointing at the button. Those arrive on top of the thing
 * someone opened the application to read, have to be dismissed before the
 * screen can be used, and are the reason people click "got it" without
 * reading. This sits in the flow of the page, takes its own line, and goes
 * away for good when dismissed, or the moment focus mode is first used:
 * a reader who found it does not need telling. That second dismissal
 * happens in the shell's toggle handler, where the event is — not during
 * this component's render, which is no place for a side effect.
 */
export function FocusHint({ show, onDismiss }) {
  const { t } = useI18n();

  if (!show) return null;

  return (
    <div className="flex items-center gap-2 rounded-(--radius-control) bg-(--color-surface-subtle) px-3 py-2 text-xs text-(--color-text-2)">
      <Icon name="focus" size={15} aria-hidden="true" className="shrink-0" />

      <p className="min-w-0 flex-1">{t('shell.focus.hint')}</p>

      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-(--radius-control) px-2 py-1 font-medium text-(--color-brand-text) hover:bg-(--color-surface-hover)"
      >
        {t('common.gotIt')}
      </button>
    </div>
  );
}
