import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { proxy } from '../proxy.js';

/*
 * The request headers proxy() hands upstream. NextResponse.next({ request })
 * carries them back as `x-middleware-request-<name>` on the response, with
 * the list of names in `x-middleware-override-headers`.
 */
function forwarded(response) {
  const names = (response.headers.get('x-middleware-override-headers') ?? '').split(',');

  return Object.fromEntries(
    names
      .filter(Boolean)
      .map((name) => [name, response.headers.get(`x-middleware-request-${name}`)]),
  );
}

function request(headers) {
  return new NextRequest('https://app.example/api/v1/me', { headers });
}

describe('proxy: the reader address handed to the API', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('forwards the address the platform set, with the secret', () => {
    vi.stubEnv('PROXY_SECRET', 'shared-secret');

    const sent = forwarded(proxy(request({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })));

    expect(sent['x-baydar-client-ip']).toBe('203.0.113.9');
    expect(sent['x-baydar-proxy-secret']).toBe('shared-secret');
  });

  it('drops a client-sent address and secret before anything else', () => {
    vi.stubEnv('PROXY_SECRET', '');

    const sent = forwarded(
      proxy(
        request({
          'x-forwarded-for': '203.0.113.9',
          'x-baydar-client-ip': '198.51.100.1',
          'x-baydar-proxy-secret': 'guessed',
        }),
      ),
    );

    expect(sent['x-baydar-client-ip']).toBeUndefined();
    expect(sent['x-baydar-proxy-secret']).toBeUndefined();
  });

  it('replaces a client-sent address with the platform one when configured', () => {
    vi.stubEnv('PROXY_SECRET', 'shared-secret');

    const sent = forwarded(
      proxy(request({ 'x-forwarded-for': '203.0.113.9', 'x-baydar-client-ip': '198.51.100.1' })),
    );

    expect(sent['x-baydar-client-ip']).toBe('203.0.113.9');
  });
});
