'use client';

import { Icon } from '@/components/ui/Icon';
import { Tooltip } from '@/components/ui/Tooltip';
import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * The two buttons that give the screen over to the figures.
 *
 * Separate controls, not one, because they do different things and a reader
 * needs to be able to choose. Focus is ours and works everywhere; fullscreen
 * is the browser's and can be refused by a policy — so its button is absent
 * rather than present-and-dead where the browser will not allow it.
 *
 * Each is a toggle and says so: `aria-pressed` carries the state, and the
 * label changes with it, so a screen reader hears "leave focus mode, pressed"
 * rather than a button whose name no longer matches what it does.
 */
export function FocusControls({ focused, fullscreen, supported, onToggleFocus, onToggleFullscreen }) {
  const { t } = useI18n();

  const focusLabel = focused ? t('shell.focus.leave') : t('shell.focus.enter');
  const fullLabel = fullscreen ? t('shell.fullscreen.leave') : t('shell.fullscreen.enter');

  return (
    <div className="flex items-center gap-1">
      <Tooltip content={`${focusLabel} · Shift + F`}>
        <button
          type="button"
          onClick={onToggleFocus}
          aria-pressed={focused}
          aria-label={focusLabel}
          className="inline-flex size-9 items-center justify-center rounded-(--radius-control) text-(--color-text-2) hover:bg-(--color-surface-hover) aria-pressed:bg-(--color-brand-soft) aria-pressed:text-(--color-brand-text)"
        >
          <Icon name={focused ? 'minimise' : 'focus'} size={19} />
        </button>
      </Tooltip>

      {supported && (
        <Tooltip content={fullLabel}>
          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-pressed={fullscreen}
            aria-label={fullLabel}
            className="hidden size-9 items-center justify-center rounded-(--radius-control) text-(--color-text-2) hover:bg-(--color-surface-hover) aria-pressed:bg-(--color-brand-soft) aria-pressed:text-(--color-brand-text) md:inline-flex"
          >
            <Icon name={fullscreen ? 'collapse' : 'expand'} size={19} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
