import { NextResponse } from 'next/server';

/**
 * Hands the API the reader's own address.
 *
 * On the hosted deployment the browser never talks to the API directly: it
 * calls `/api/v1/*` on this host and next.config.mjs rewrites it on. The API
 * then sees this platform's connection, not the reader's, and its limiters —
 * keyed by address — would count the whole internet as one visitor.
 *
 * So the address this host received goes along in `x-baydar-client-ip`. The
 * platform sets `x-forwarded-for` itself and does not pass on a value the
 * client sent (Vercel: "we currently overwrite the X-Forwarded-For header
 * and do not forward external IPs"), so what is read here is the reader's.
 * The secret beside it is what the API checks before believing it
 * (backend TrustFrontendProxy). Anything a client sent in either header is
 * dropped first, whatever happens next.
 *
 * Without PROXY_SECRET (local development, where the browser calls the API
 * itself) the headers are only removed, never added.
 */
export function proxy(request) {
  const headers = new Headers(request.headers);

  headers.delete('x-baydar-client-ip');
  headers.delete('x-baydar-proxy-secret');

  const secret = process.env.PROXY_SECRET;
  const forwarded = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip');
  const address = forwarded?.split(',')[0]?.trim();

  if (secret && address) {
    headers.set('x-baydar-client-ip', address);
    headers.set('x-baydar-proxy-secret', secret);
  }

  return NextResponse.next({ request: { headers } });
}

// Only the requests that are forwarded to the API.
export const config = {
  matcher: ['/api/v1/:path*', '/sanctum/:path*'],
};
