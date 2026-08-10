import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockRequest, createMockResponse, mockApiKeyHeaders } from '~/lib/testing/test-helpers';
import { clearRateLimits } from '~/lib/security';
import { loader, action } from '~/routes/api.netlify-user';

/**
 * Set up the fetch mock to return a Netlify user response.
 */
function setupNetlifyFetchMock(opts?: {
  ok?: boolean;
  status?: number;
  userData?: Record<string, unknown>;
  sites?: Record<string, unknown>[];
}) {
  const ok = opts?.ok ?? true;
  const status = opts?.status ?? 200;
  const userData = opts?.userData ?? {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    avatar_url: 'https://example.com/avatar.png',
    full_name: 'Test User Full',
  };
  const sites = opts?.sites ?? [
    {
      id: 'site-1',
      name: 'my-site',
      url: 'https://my-site.netlify.app',
      admin_url: 'https://app.netlify.com/sites/my-site',
      build_settings: { cmd: 'npm run build' },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
    },
  ];

  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const urlStr = typeof input === 'string' ? input : input.toString();

    if (urlStr.includes('/api/v1/user')) {
      return {
        ok,
        status,
        statusText: ok ? 'OK' : 'Unauthorized',
        json: async () => userData,
        text: async () => JSON.stringify(userData),
        headers: new Headers(),
      } as Response;
    }

    if (urlStr.includes('/api/v1/sites')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => sites,
        text: async () => JSON.stringify(sites),
        headers: new Headers(),
      } as Response;
    }

    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
      text: async () => '',
      headers: new Headers(),
    } as Response;
  });
}

describe('api.netlify-user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimits();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearRateLimits();
  });

  describe('loader (GET)', () => {
  it('returns 401 when no Netlify token is found', async () => {
    setupNetlifyFetchMock();
    const request = createMockRequest({ url: 'https://test.example.com/api/netlify-user' });

    const response = await createMockResponse(
      loader({ request, context: { cloudflare: { env: {} } }, params: {} } as any),
    );

    expect(response.status).toBe(401);
    expect((response.bodyJson as any).error).toBe('Netlify token not found');
  });

  it('returns user data when a valid token is provided via API key header', async () => {
    setupNetlifyFetchMock();
    const headers = mockApiKeyHeaders({ VITE_NETLIFY_ACCESS_TOKEN: 'nfp-test-fake-token-aaaaaaaa' });
    const request = createMockRequest({
      url: 'https://test.example.com/api/netlify-user',
      headers,
    });

    const response = await createMockResponse(
      loader({ request, context: { cloudflare: { env: {} } }, params: {} } as any),
    );

    expect(response.status).toBe(200);
    const body = response.bodyJson as any;
    expect(body.id).toBe('user-123');
    expect(body.email).toBe('test@example.com');
    expect(body.full_name).toBe('Test User Full');
  });

  it('returns user data when token is provided via Cloudflare env', async () => {
    setupNetlifyFetchMock();
    const request = createMockRequest({ url: 'https://test.example.com/api/netlify-user' });

    const response = await createMockResponse(
      loader({
        request,
        context: { cloudflare: { env: { VITE_NETLIFY_ACCESS_TOKEN: 'nfp-test-fake-env-token-bb' } } },
        params: {},
      } as any),
    );

    expect(response.status).toBe(200);
    expect((response.bodyJson as any).id).toBe('user-123');
  });

  it('returns 401 when Netlify API responds with 401', async () => {
    setupNetlifyFetchMock({ ok: false, status: 401 });
    const headers = mockApiKeyHeaders({ VITE_NETLIFY_ACCESS_TOKEN: 'nfp-test-invalid-token' });
    const request = createMockRequest({
      url: 'https://test.example.com/api/netlify-user',
      headers,
    });

    const response = await createMockResponse(
      loader({ request, context: { cloudflare: { env: {} } }, params: {} } as any),
    );

    expect(response.status).toBe(401);
    expect((response.bodyJson as any).error).toBe('Invalid Netlify token');
  });

  it('returns 500 when Netlify API responds with a server error', async () => {
    setupNetlifyFetchMock({ ok: false, status: 500 });
    const headers = mockApiKeyHeaders({ VITE_NETLIFY_ACCESS_TOKEN: 'nfp-test-fake-token-aaaaaaaa' });
    const request = createMockRequest({
      url: 'https://test.example.com/api/netlify-user',
      headers,
    });

    const response = await createMockResponse(
      loader({ request, context: { cloudflare: { env: {} } }, params: {} } as any),
    );

    expect(response.status).toBe(500);
    expect((response.bodyJson as any).error).toBe('Failed to fetch Netlify user information');
  });

  it('returns 405 for a POST request (only GET is allowed for loader)', async () => {
    setupNetlifyFetchMock();
    const headers = mockApiKeyHeaders({ VITE_NETLIFY_ACCESS_TOKEN: 'nfp-test-fake-token-aaaaaaaa' });
    const request = createMockRequest({
      method: 'POST',
      url: 'https://test.example.com/api/netlify-user',
      headers,
    });

    const response = await createMockResponse(
      loader({ request, context: { cloudflare: { env: {} } }, params: {} } as any),
    );

    expect(response.status).toBe(405);
  });
  });

  describe('action (POST)', () => {
    it('returns 401 when no Netlify token is found in action', async () => {
      setupNetlifyFetchMock();
      const formData = new FormData();
      formData.append('action', 'get_sites');
      const request = new Request('https://test.example.com/api/netlify-user', {
        method: 'POST',
        body: formData,
      });

      const response = await createMockResponse(
        action({ request, context: { cloudflare: { env: {} } }, params: {} } as any),
      );

      expect(response.status).toBe(401);
      expect((response.bodyJson as any).error).toBe('Netlify token not found');
    });

    it('returns 400 for an invalid action value', async () => {
      setupNetlifyFetchMock();
      const headers = mockApiKeyHeaders({ VITE_NETLIFY_ACCESS_TOKEN: 'nfp-test-fake-token-aaaaaaaa' });
      const formData = new FormData();
      formData.append('action', 'invalid_action');
      const request = new Request('https://test.example.com/api/netlify-user', {
        method: 'POST',
        body: formData,
        headers,
      });

      const response = await createMockResponse(
        action({ request, context: { cloudflare: { env: {} } }, params: {} } as any),
      );

      expect(response.status).toBe(400);
      expect((response.bodyJson as any).error).toBe('Invalid action');
    });

    it('returns sites when action is get_sites with valid token', async () => {
      setupNetlifyFetchMock();
      const headers = mockApiKeyHeaders({ VITE_NETLIFY_ACCESS_TOKEN: 'nfp-test-fake-token-aaaaaaaa' });
      const formData = new FormData();
      formData.append('action', 'get_sites');
      const request = new Request('https://test.example.com/api/netlify-user', {
        method: 'POST',
        body: formData,
        headers,
      });

      const response = await createMockResponse(
        action({ request, context: { cloudflare: { env: {} } }, params: {} } as any),
      );

      expect(response.status).toBe(200);
      const body = response.bodyJson as any;
      expect(body.totalSites).toBe(1);
      expect(body.sites[0].id).toBe('site-1');
    });

    it('returns 405 for a GET request to the action handler', async () => {
      setupNetlifyFetchMock();
      const headers = mockApiKeyHeaders({ VITE_NETLIFY_ACCESS_TOKEN: 'nfp-test-fake-token-aaaaaaaa' });
      const request = createMockRequest({
        method: 'GET',
        url: 'https://test.example.com/api/netlify-user',
        headers,
      });

      const response = await createMockResponse(
        action({ request, context: { cloudflare: { env: {} } }, params: {} } as any),
      );

      expect(response.status).toBe(405);
    });
  });
});