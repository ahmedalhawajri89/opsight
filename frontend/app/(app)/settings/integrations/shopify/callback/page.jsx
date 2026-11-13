'use client';

import { Suspense } from 'react';

import { ShopifyCallback } from '@/features/integrations/ShopifyCallback';

/**
 * Where Shopify sends the owner's browser back after they approve Baydar.
 * Must match the redirect URL on Baydar's Shopify app (SHOPIFY_REDIRECT_URI).
 *
 * Inside the signed-in shell, as Zid's is: the answer is handed to the API
 * from here, in the owner's own session, so the server can check the state
 * against the person who started and Shopify's signature over the rest.
 */
export default function ShopifyCallbackPage() {
  return (
    <Suspense fallback={null}>
      <ShopifyCallback />
    </Suspense>
  );
}
