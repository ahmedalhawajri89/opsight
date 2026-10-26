'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useSeenOnce } from '@/hooks/useSeenOnce';

/**
 * An invitation to install, offered once and only after it is plausible.
 *
 * Chrome puts an install button in the address bar and almost nobody knows
 * what it is, so an application that wants to be installed has to say so.
 * The ways to get this wrong are all the same mistake — asking too early:
 *
 * It waits for the THIRD visit. Someone on their first ten seconds is being
 * asked for a commitment before they know whether they want one, and the
 * honest answer at that point is no. By the third separate session they
 * have decided this is a tool they come back to.
 *
 * It never reappears once declined. A prompt that returns is not an offer,
 * it is pestering, and it teaches a reader that dismissing anything here is
 * pointless — which they then apply to the warnings that matter.
 *
 * And it only exists when the browser says the application is installable.
 * `beforeinstallprompt` fires when every criterion is met: not on iOS, not
 * when it is already installed, not over plain HTTP. No event, no banner —
 * rather than a button that explains at the end that it cannot work.
 */
export function InstallPrompt() {
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  const deferred = useRef(null);
  const [show, dismiss] = useSeenOnce('install', { after: 3 });

  useEffect(() => {
    const capture = (event) => {
      /*
       * Prevented so Chrome does not show its own mini-infobar, and kept so
       * the prompt can be opened later from our button. The event is single
       * use: once prompt() has been called it cannot be called again.
       */
      event.preventDefault();
      deferred.current = event;
      setReady(true);
    };

    const installed = () => {
      setReady(false);
      dismiss();
    };

    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', installed);

    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', installed);
    };
  }, [dismiss]);

  if (!ready || !show) return null;

  async function install() {
    const event = deferred.current;

    if (event === null) return;

    deferred.current = null;
    setReady(false);

    try {
      await event.prompt();
    } catch {
      // Already used, or refused by the browser. Nothing to report: the
      // address bar still offers it.
    }

    // Asked once either way. Someone who saw the browser's own dialog and
    // said no does not need ours again.
    dismiss();
  }

  return (
    <div
      role="complementary"
      aria-label={t('install.title')}
      className="rise fixed bottom-4 z-30 max-w-[22rem] rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-4 shadow-(--shadow-overlay) end-4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-(--radius-control) bg-(--color-brand-soft) text-(--color-brand-text)"
        >
          <Icon name="expand" size={18} />
        </span>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-(--color-text)">{t('install.title')}</p>
          <p className="measure mt-1 text-sm text-(--color-text-2)">{t('install.body')}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={install}>
              {t('install.action')}
            </Button>
            <Button variant="ghost" size="sm" onClick={dismiss}>
              {t('install.dismiss')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
