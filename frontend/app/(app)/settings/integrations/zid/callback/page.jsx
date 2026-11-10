'use client';

import { Suspense } from 'react';

import { ZidCallback } from '@/features/integrations/ZidCallback';

/**
 * Where Zid sends the owner's browser back after they approve Baydar
 * (ADR-037). Must match the Redirection URL on the Zid app exactly.
 *
 * Inside the signed-in shell on purpose: the code is handed to the API from
 * here, in the owner's own session, so the server can check the `state`
 * against the person who started the flow. A redirect straight to the API
 * could not.
 *
 * Suspense because the code and state come from the query string.
 */
export default function ZidCallbackPage() {
  return (
    <Suspense fallback={null}>
      <ZidCallback />
    </Suspense>
  );
}
