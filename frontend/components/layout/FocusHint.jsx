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
 * reading. It goes away for good when dismissed, or the moment focus mode is
 * first used: a reader who found it does not need telling. That second
 * dismissal happens in the shell's toggle handler, where the event is — not
 * during this component's render, which is no place for a side effect.
 *
 * IT USED TO TAKE THE FIRST ROW OF EVERY SCREEN. Rendered at the top of
 * `<main>`, above `{children}`, it pushed every page's own title down a line
 * — on the orders screen, the customers screen, the settings screen, every
 * visit until somebody dismissed it. The most valuable row in the interface
 * was on loan to a note about a keyboard shortcut.
 *
 * So it sits in the bar now, beside the control it is describing, which is
 * also where a reader has to look to act on it. Pointing at a button from
 * four inches below it was never the clearer arrangement; it was only the
 * easier one to lay out.
 *
 * It is `lg:` and up for a reason, and not a cosmetic one: the sentence names
 * a keyboard shortcut, and the bar has no room for it beside a search field
 * until there is room for both. The shell already withholds it from anything
 * narrower than a desk, where focus mode itself does nothing.
 */
export function FocusHint({ show, onDismiss }) {
  const { t } = useI18n();

  if (!show) return null;

  return (
    <div className="hidden items-center gap-2 rounded-(--radius-pill) bg-(--color-surface-subtle) py-1 ps-3 pe-1 text-xs text-(--color-text-2) lg:flex">
      <Icon name="focus" size={14} aria-hidden="true" className="shrink-0" />

      <p className="min-w-0 truncate">{t('shell.focus.hint')}</p>

      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-(--radius-pill) px-2 py-1 font-medium text-(--color-brand-text) hover:bg-(--color-surface-hover)"
      >
        {t('common.gotIt')}
      </button>
    </div>
  );
}
