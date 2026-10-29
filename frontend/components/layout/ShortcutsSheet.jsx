'use client';

import { Dialog } from '@/components/ui/Dialog';
import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * What the keyboard can do here, in one place.
 *
 * A shortcut nobody can find is a shortcut nobody has. The three this
 * application already had — Ctrl/⌘+K, Shift+F, and Escape — were each
 * documented in a tooltip, a one-time hint, and nowhere at all respectively.
 *
 * Opened by `?`, which is the convention, and from the palette, which is
 * where someone who does not know the convention will look.
 */
export function ShortcutsSheet({ open, onClose, destinations }) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onClose={onClose} title={t('shell.shortcuts.title')} size="md">
      <div className="space-y-5">
        <Group title={t('shell.shortcuts.general')}>
          <Row keys={['Ctrl', 'K']} label={t('shell.shortcuts.search')} />
          <Row keys={['Shift', 'F']} label={t('shell.focus.enter')} />
          <Row keys={['?']} label={t('shell.shortcuts.help')} />
        </Group>

        {destinations.length > 0 && (
          <Group title={t('shell.shortcuts.goTo')}>
            {destinations.map((destination) => (
              <Row
                key={destination.href}
                keys={['G', destination.key.toUpperCase()]}
                label={destination.label}
              />
            ))}
          </Group>
        )}
      </div>
    </Dialog>
  );
}

function Group({ title, children }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium tracking-[0.1em] text-(--color-muted) uppercase">
        {title}
      </h3>
      <ul className="divide-y divide-(--color-line-subtle)">{children}</ul>
    </section>
  );
}

function Row({ keys, label }) {
  return (
    <li className="flex items-center justify-between gap-4 py-2">
      <span className="min-w-0 text-base text-(--color-text)">{label}</span>
      {/*
       * dir="ltr": a chord is read in the order it is pressed, and `G` then
       * `D` must not become `D` then `G` because the page runs the other way.
       */}
      <span dir="ltr" className="flex shrink-0 items-center gap-1">
        {keys.map((key) => (
          <kbd
            key={key}
            className="inline-flex h-6 min-w-6 items-center justify-center rounded-(--radius-control) border border-(--color-line-strong) bg-(--color-ground) px-1.5 font-sans text-xs font-medium text-(--color-text-2)"
          >
            {key}
          </kbd>
        ))}
      </span>
    </li>
  );
}
