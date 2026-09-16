import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, SESSION_EXPIRED_EVENT, api, request } from '@/lib/apiClient';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === null ? '' : JSON.stringify(body)),
  };
}

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('successful requests', () => {
  it('sends credentials so the session cookie travels', async () => {
    fetch.mockResolvedValue(jsonResponse({ data: { id: 1 } }));

    await api.get('/me');

    const [, options] = fetch.mock.calls[0];
    expect(options.credentials).toBe('include');
    expect(options.headers.Accept).toBe('application/json');
  });

  it('returns a 204 as null rather than throwing on an empty body', async () => {
    fetch.mockResolvedValue(jsonResponse(null, 204));

    await expect(api.post('/auth/logout')).resolves.toBeNull();
  });
});

describe('CSRF handling', () => {
  it('fetches the CSRF cookie before an unsafe request when none exists', async () => {
    fetch.mockResolvedValue(jsonResponse({ data: {} }));

    await api.post('/auth/login', { email: 'a@b.test', password: 'x' });

    expect(fetch.mock.calls[0][0]).toContain('/sanctum/csrf-cookie');
    expect(fetch.mock.calls[1][0]).toContain('/api/v1/auth/login');
  });

  it('sends the XSRF header on unsafe methods and omits it on GET', async () => {
    document.cookie = 'XSRF-TOKEN=token-value; path=/';
    fetch.mockResolvedValue(jsonResponse({ data: {} }));

    await api.post('/auth/login', {});
    expect(fetch.mock.calls[0][1].headers['X-XSRF-TOKEN']).toBe('token-value');

    fetch.mockClear();

    await api.get('/me');
    expect(fetch.mock.calls[0][1].headers['X-XSRF-TOKEN']).toBeUndefined();
  });
});

describe('query serialisation', () => {
  it('serialises filters in the documented filter[key] form', async () => {
    fetch.mockResolvedValue(jsonResponse({ data: [] }));

    await api.get('/orders', {
      params: { page: 2, per_page: 25, filter: { status: 'confirmed', customer_id: 88 } },
    });

    const url = fetch.mock.calls[0][0];
    expect(url).toContain('page=2');
    expect(url).toContain('filter%5Bstatus%5D=confirmed');
    expect(url).toContain('filter%5Bcustomer_id%5D=88');
  });

  it('drops empty values instead of sending blank filters', async () => {
    fetch.mockResolvedValue(jsonResponse({ data: [] }));

    await api.get('/orders', { params: { search: '', page: null, filter: { status: '' } } });

    expect(fetch.mock.calls[0][0]).not.toContain('?');
  });
});

describe('error normalisation', () => {
  it('maps a 422 into field errors a form can consume', async () => {
    fetch.mockResolvedValue(
      jsonResponse(
        {
          message: 'The given data was invalid.',
          code: 'validation.failed',
          errors: { email: ['These credentials do not match our records.'] },
        },
        422,
      ),
    );

    const error = await api.post('/auth/login', {}).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.isValidation).toBe(true);
    expect(error.code).toBe('validation.failed');
    expect(error.fieldErrors.email).toBe('These credentials do not match our records.');
  });

  it('turns a network failure into status 0 rather than an unhandled rejection', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await api.get('/me').catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.isNetwork).toBe(true);
    expect(error.status).toBe(0);
  });

  it('survives a non-JSON error body', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '<html>Gateway error</html>',
    });

    const error = await api.get('/me').catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);
    expect(error.code).toBe('unknown');
  });

  it('carries the 500 reference id so the UI can show it', async () => {
    fetch.mockResolvedValue(
      jsonResponse(
        { message: 'An unexpected error occurred.', code: 'server.error', reference: 'abc-123' },
        500,
      ),
    );

    const error = await api.get('/me').catch((e) => e);

    expect(error.reference).toBe('abc-123');
  });

  it('does not swallow an aborted request', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    fetch.mockRejectedValue(abortError);

    await expect(api.get('/me')).rejects.toThrow('aborted');
  });
});

describe('session expiry', () => {
  it('fires one global event on 401 so expiry is handled in a single place', async () => {
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    fetch.mockResolvedValue(
      jsonResponse({ message: 'Authentication required.', code: 'auth.unauthenticated' }, 401),
    );

    await request('/orders').catch(() => {});

    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });

  it('does not fire the event for the session probe itself', async () => {
    // A 401 from GET /me means "not signed in" — an answer, not an expiry.
    // Treating it as expiry would clear the cache, refetch /me, and loop.
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    fetch.mockResolvedValue(
      jsonResponse({ message: 'Authentication required.', code: 'auth.unauthenticated' }, 401),
    );

    await request('/me', { suppressExpiryEvent: true }).catch(() => {});

    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });

  it('does not fire the event for a 403', async () => {
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    fetch.mockResolvedValue(
      jsonResponse({ message: 'Not available for your role.', code: 'auth.forbidden' }, 403),
    );

    const error = await request('/expenses').catch((e) => e);

    // Being forbidden is not being logged out. Conflating them would sign a
    // user out every time they touched something above their role.
    expect(listener).not.toHaveBeenCalled();
    expect(error.isForbidden).toBe(true);

    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });
});
