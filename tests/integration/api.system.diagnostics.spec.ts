import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockRequest, createMockResponse, mockAuthHeaders } from '~/lib/testing/test-helpers';
import { clearRateLimits } from '~/lib/security';
import { loader } from '~/routes/api.system.diagnostics';

/**
 * Helper to set up the global fetch mock for diagnostics tests.
 * The diagnostics route makes two external fetch calls: one to GitHub
 * and one to Netlify. Both are mocked to avoid real network calls.
 */
function setupFetchMock(opts?: { githubOk?: boolean; netlifyOk?: boolean }) {
  const githubOk = opts?.githubOk ?? true;
  const netlifyOk = opts?.netlifyOk ?? true;

  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const urlStr = typeof input === 'string' ? input : input.toString();

    if (urlStr.includes('github.com')) {
      return {
        ok: githubOk,
        status: githubOk ? 200 : 503,
        statusText: githubOk ? 'OK' : 'Service Unavailable',
        json: async () => ({}),
        text: async () => '',
        headers: new Headers(),
      } as Response;
    }

    if (urlStr.includes('netlify.com')) {
      return {
        ok: netlifyOk,
        status: netlifyOk ? 200 : 503,
        statusText: netlifyOk ? 'OK' : 'Service Unavailable',
        json: async () => ({}),
        text: async () => '',
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

describe('api.system.diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimits();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearRateLimits();
  });

  it('returns 200 with diagnostics data for admin role', async () => {
    setupFetchMock();
    const headers = mockAuthHeaders('admin');
    const request = createMockRequest({
      url: 'https://test.example.com/api/system/diagnostics',
      headers,
    });

    const response = await createMockResponse(
      loader({ request, context: { env: {} }, params: {} } as any) as unknown as Response,
    );

    expect(response.status).toBe(200);
    const body = response.bodyJson as any;
    expect(body.status).toBe('success');
    expect(body).toHaveProperty('environment');
    expect(body).toHaveProperty('cookies');
    expect(body).toHaveProperty('externalApis');
    expect(body).toHaveProperty('technicalDetails');
  });

  it('returns 200 with diagnostics data for operator role', async () => {
    setupFetchMock();
    const headers = mockAuthHeaders('operator');
    const request = createMockRequest({
      url: 'https://test.example.com/api/system/diagnostics',
      headers,
    });

    const response = await createMockResponse(
      loader({ request, context: { env: {} }, params: {} } as any) as unknown as Response,
    );

    expect(response.status).toBe(200);
    const body = response.bodyJson as any;
    expect(body.status).toBe('success');
  });

  it('returns 403 for user role (insufficient permissions)', async () => {
    setupFetchMock();
    const headers = mockAuthHeaders('user');
    const request = createMockRequest({
      url: 'https://test.example.com/api/system/diagnostics',
      headers,
    });

    const response = await createMockResponse(
      loader({ request, context: { env: {} }, params: {} } as any) as unknown as Response,
    );

    expect(response.status).toBe(403);
    const body = response.bodyJson as any;
    expect(body.error).toBe(true);
    expect(body.message).toBe('Forbidden');
  });

  it('returns 403 when no auth headers are present (defaults to user role)', async () => {
    setupFetchMock();
    const request = createMockRequest({
      url: 'https://test.example.com/api/system/diagnostics',
    });

    const response = await createMockResponse(
      loader({ request, context: { env: {} }, params: {} } as any) as unknown as Response,
    );

    expect(response.status).toBe(403);
  });

  it('returns 405 for a POST request (only GET is allowed)', async () => {
    setupFetchMock();
    const headers = mockAuthHeaders('admin');
    const request = createMockRequest({
      method: 'POST',
      url: 'https://test.example.com/api/system/diagnostics',
      headers,
    });

    const response = await createMockResponse(
      loader({ request, context: { env: {} }, params: {} } as any) as unknown as Response,
    );

    expect(response.status).toBe(405);
  });

  it('includes external API status in the response body', async () => {
    setupFetchMock({ githubOk: true, netlifyOk: false });
    const headers = mockAuthHeaders('admin');
    const request = createMockRequest({
      url: 'https://test.example.com/api/system/diagnostics',
      headers,
    });

    const response = await createMockResponse(
      loader({ request, context: { env: {} }, params: {} } as any) as unknown as Response,
    );

    expect(response.status).toBe(200);
    const body = response.bodyJson as any;
    expect(body.externalApis.github.isReachable).toBe(true);
    expect(body.externalApis.netlify.isReachable).toBe(false);
  });
});