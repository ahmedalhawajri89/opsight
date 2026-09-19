'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * Downloads the current view as CSV.
 *
 * Two things this deliberately does that a plain link would not.
 *
 * It passes the screen's LIVE FILTERS, so "export" means "export what I am
 * looking at" rather than "export the whole table". The server runs the list
 * and the export through one query definition, so the two cannot disagree.
 *
 * And it reports failure in place. An export can legitimately be refused — no
 * `*.export` ability, or a result above the row cap — and a plain `<a href>`
 * would navigate the user out of the application and into a page of raw JSON.
 * The refusal is a sentence under the button instead.
 */
export function ExportButton({ onExport, filters, label, disabled = false, className }) {
  const { t } = useI18n();
  const [state, setState] = useState({ busy: false, error: null });

  async function run() {
    setState({ busy: true, error: null });

    try {
      await onExport(filters);
      setState({ busy: false, error: null });
    } catch (error) {
      setState({ busy: false, error });
    }
  }

  return (
    <div className={className}>
      <Button variant="secondary" size="sm" onClick={run} loading={state.busy} disabled={disabled}>
        {state.busy ? t('export.preparing') : (label ?? t('export.label'))}
      </Button>

      {state.error && (
        <p role="alert" className="mt-1.5 max-w-xs text-sm text-(--color-danger)">
          {/*
            The row-cap refusal names the count and the limit and tells the
            reader to narrow the filters, so showing the server's message is
            more useful than a generic "export failed".
          */}
          {messageFor(state.error, t)}
        </p>
      )}
    </div>
  );
}

function messageFor(error, t) {
  if (error?.isForbidden) {
    return t('export.forbidden');
  }

  if (error?.isValidation) {
    return error.fieldErrors?.filter ?? error.message;
  }

  return error?.message ?? t('export.failed');
}
