/**
 * Test helper utilities for API route and request testing.
 *
 * These helpers create mock Request/Response objects and Headers that match
 * the header conventions used throughout the bolt.diy API routes:
 *
 *  - `x-api-keys`          — encodeURIComponent(JSON.stringify({ provider: key }))
 *  - `x-provider-settings` — encodeURIComponent(JSON.stringify({ provider: settings }))
 *  - `x-user-role`         — plain string role (e.g. "admin", "operator", "user")
 *  - `x-user-permissions` — comma-separated permission list
 *  - `x-csrf-token`        — plain string CSRF token
 *
 * All mock data values are obviously fake and must never contain real credentials.
 */

/**
 * Options for creating a mock Request.
 */
export interface CreateMockRequestOptions {
  /** Request URL (defaults to `https://test.example.com/api`). */
  url?: string;
  /** HTTP method (defaults to `GET`). */
  method?: string;
  /** Additional headers to attach. */
  headers?: Record<string, string> | Headers;
  /** Optional JSON-serialisable body. When provided, the body is stringified
   *  and `Content-Type: application/json` is set automatically. */
  body?: unknown;
  /** Set to `false` to skip auto-adding `Content-Type: application/json`
   *  when a body is supplied (defaults to `true`). */
  jsonContentType?: boolean;
}

/**
 * Create a mock {@link Request} suitable for testing Remix/Cloudflare route
 * loaders and actions.
 *
 * @example
 *   const request = createMockRequest({
 *     method: 'POST',
 *     body: { message: 'hello' },
 *     headers: { 'x-csrf-token': 'test-token' },
 *   });
 */
export function createMockRequest(options: CreateMockRequestOptions = {}): Request {
  const {
    url = 'https://test.example.com/api',
    method = 'GET',
    headers,
    body,
    jsonContentType = true,
  } = options;

  const init: RequestInit = { method };

  const mergedHeaders = new Headers(headers);

  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);

    if (jsonContentType && !mergedHeaders.has('Content-Type')) {
      mergedHeaders.set('Content-Type', 'application/json');
    }
  }

  init.headers = mergedHeaders;

  return new Request(url, init);
}

/**
 * Captured representation of a {@link Response} for easy assertion in tests.
 */
export interface CapturedResponse {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Headers;
  bodyText: string;
  bodyJson: unknown;
  response: Response;
}

/**
 * Capture a {@link Response} (or a Promise resolving to one) from a route
 * handler and return a structured object with the parsed body for assertion.
 *
 * @example
 *   const captured = await createMockResponse(routeHandler({ request }));
 *   expect(captured.status).toBe(200);
 *   expect(captured.bodyJson).toEqual({ ok: true });
 */
export async function createMockResponse(
  source: Response | Promise<Response>,
): Promise<CapturedResponse> {
  const response = await source;

  let bodyText = '';

  try {
    bodyText = await response.text();
  } catch {
    // Some responses (e.g. 204 No Content) may not have a readable body.
  }

  let bodyJson: unknown = undefined;

  if (bodyText.length > 0) {
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      // Body is not JSON — leave bodyJson undefined.
    }
  }

  return {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    headers: response.headers,
    bodyText,
    bodyJson,
    response,
  };
}

/**
 * Create a {@link Headers} object with the `x-api-keys` header set to a
 * URL-encoded JSON map of provider → API key.
 *
 * @param keys A record of provider names to (fake) API key strings.
 *
 * @example
 *   const headers = mockApiKeyHeaders({ openai: 'sk-test-xxxxx' });
 */
export function mockApiKeyHeaders(keys: Record<string, string>): Headers {
  const headers = new Headers();
  headers.set('x-api-keys', encodeURIComponent(JSON.stringify(keys)));
  return headers;
}

/**
 * Create a {@link Headers} object with the `x-provider-settings` header set
 * to a URL-encoded JSON map of provider → settings object.
 *
 * @param settings A record of provider names to settings objects.
 *
 * @example
 *   const headers = mockProviderSettingsHeaders({ anthropic: { region: 'us' } });
 */
export function mockProviderSettingsHeaders(settings: Record<string, unknown>): Headers {
  const headers = new Headers();
  headers.set('x-provider-settings', encodeURIComponent(JSON.stringify(settings)));
  return headers;
}

/**
 * Create a {@link Headers} object with authentication role and permission
 * headers (`x-user-role` and `x-user-permissions`).
 *
 * @param role The user role string (e.g. `"admin"`, `"operator"`, `"user"`).
 * @param permissions Optional array of permission strings. When omitted, the
 *  `x-user-permissions` header is not set.
 *
 * @example
 *   const headers = mockAuthHeaders('admin', ['read:self', 'write:self']);
 */
export function mockAuthHeaders(role: string, permissions?: string[]): Headers {
  const headers = new Headers();
  headers.set('x-user-role', role);

  if (permissions && permissions.length > 0) {
    headers.set('x-user-permissions', permissions.join(','));
  }

  return headers;
}

/**
 * Create a {@link Headers} object with the `x-csrf-token` header set.
 *
 * @param token The CSRF token string. Defaults to a fake test token.
 *
 * @example
 *   const headers = mockCsrfHeaders('test-csrf-token-12345');
 */
export function mockCsrfHeaders(token: string = 'test-csrf-token-fake'): Headers {
  const headers = new Headers();
  headers.set('x-csrf-token', token);
  return headers;
}