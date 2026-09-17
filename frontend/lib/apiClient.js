/**
 * The only module in the application that calls fetch.
 *
 * Components never see a URL and never handle a raw Response. Everything goes
 * through here so that credentials, CSRF and error shape are handled once.
 *
 * See docs/architecture/FRONTEND_ARCHITECTURE.md §4.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

/** Fired once, globally, when the session is gone. */
export const SESSION_EXPIRED_EVENT = 'opsight:session-expired';

const UNSAFE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * A single error shape for every failure — HTTP, validation, or network.
 *
 * Components branch on `code`, never on `message`. Message text is for humans
 * and is allowed to change; codes are a contract.
 */
export class ApiError extends Error {
  constructor({ status, code, message, errors, reference }) {
    super(message ?? 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = code ?? 'unknown';
    this.errors = errors ?? {};
    this.reference = reference ?? null;
  }

  /** Field-level validation messages, ready for a form to consume. */
  get fieldErrors() {
    return Object.fromEntries(
      Object.entries(this.errors).map(([field, messages]) => [
        field,
        Array.isArray(messages) ? messages[0] : messages,
      ]),
    );
  }

  get isValidation() {
    return this.status === 422;
  }

  get isUnauthenticated() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  /** status 0 means the request never reached the server. */
  get isNetwork() {
    return this.status === 0;
  }
}

function readCookie(name) {
  if (typeof document === 'undefined') return null;

  const match = document.cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));

  return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Sanctum sets XSRF-TOKEN as a readable cookie; we echo it back in a header.
 * It is deliberately readable — it is the double-submit token and carries no
 * authority on its own. The session cookie beside it is HttpOnly.
 */
let csrfPromise = null;

async function ensureCsrfCookie() {
  if (readCookie('XSRF-TOKEN')) return;

  // Concurrent mutations must not each fire their own request.
  csrfPromise ??= fetch(`${BASE_URL}/sanctum/csrf-cookie`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  }).finally(() => {
    csrfPromise = null;
  });

  await csrfPromise;
}

function buildQuery(params) {
  if (!params) return '';

  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;

    // Filters serialise as filter[status]=x, matching the API contract.
    if (key === 'filter' && typeof value === 'object') {
      for (const [filterKey, filterValue] of Object.entries(value)) {
        if (filterValue === undefined || filterValue === null || filterValue === '') continue;
        search.append(`filter[${filterKey}]`, filterValue);
      }
      continue;
    }

    search.append(key, value);
  }

  const query = search.toString();

  return query ? `?${query}` : '';
}

async function parseBody(response) {
  if (response.status === 204) return null;

  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function request(
  path,
  { method = 'GET', body, params, signal, suppressExpiryEvent = false } = {},
) {
  const upperMethod = method.toUpperCase();
  const isUnsafe = UNSAFE_METHODS.includes(upperMethod);

  if (isUnsafe) {
    await ensureCsrfCookie();
  }

  const headers = {
    Accept: 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (isUnsafe) {
    const token = readCookie('XSRF-TOKEN');
    if (token) headers['X-XSRF-TOKEN'] = token;
  }

  let response;

  try {
    response = await fetch(`${BASE_URL}/api/v1${path}${buildQuery(params)}`, {
      method: upperMethod,
      headers,
      // Without this the session cookie is neither sent nor stored.
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    // An aborted request is not a failure worth reporting.
    if (cause?.name === 'AbortError') throw cause;

    throw new ApiError({
      status: 0,
      code: 'network.unreachable',
      message: 'Could not reach the server. Check your connection and try again.',
    });
  }

  const payload = await parseBody(response);

  if (response.ok) {
    return payload;
  }

  const error = new ApiError({
    status: response.status,
    code: payload?.code,
    message: payload?.message,
    errors: payload?.errors,
    reference: payload?.reference,
  });

  /*
   * One global session-expiry path, fired here rather than in every hook.
   * The auth provider listens and clears state once.
   *
   * `suppressExpiryEvent` exists for the session probe itself: a 401 from
   * GET /me is the answer "you are not signed in", not the event "your session
   * just ended". Treating it as expiry would clear the cache, refetch /me, get
   * another 401, and loop.
   */
  if (error.isUnauthenticated && !suppressExpiryEvent && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  }

  throw error;
}

/**
 * Fetches a file and hands it to the browser as a download.
 *
 * NOT a plain `<a href>` to the API, which is the obvious implementation and
 * the wrong one: an export can legitimately fail — 403 without the ability,
 * 422 when the row cap is exceeded — and a navigation would replace the
 * application with a page of raw JSON the user cannot get back from. Fetching
 * the body means a failure arrives as an ApiError like any other and the
 * screen can say what went wrong.
 *
 * Reads the filename from Content-Disposition rather than inventing one, so
 * the server owns the naming and the date stamp it puts on the file.
 */
export async function download(path, { params, fallbackName = 'export.csv' } = {}) {
  let response;

  try {
    response = await fetch(`${BASE_URL}/api/v1${path}${buildQuery(params)}`, {
      method: 'GET',
      headers: { Accept: 'text/csv, application/json' },
      credentials: 'include',
    });
  } catch {
    throw new ApiError({
      status: 0,
      code: 'network.unreachable',
      message: 'Could not reach the server. Check your connection and try again.',
    });
  }

  if (!response.ok) {
    const payload = await parseBody(response);

    throw new ApiError({
      status: response.status,
      code: payload?.code,
      message: payload?.message,
      errors: payload?.errors,
    });
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filenameFrom(response.headers.get('Content-Disposition')) ?? fallbackName;

  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoked on the next tick: releasing it synchronously can cancel the
  // download in some browsers before it has started reading.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function filenameFrom(header) {
  if (!header) return null;

  const match = header.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);

  return match ? decodeURIComponent(match[1]) : null;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};
