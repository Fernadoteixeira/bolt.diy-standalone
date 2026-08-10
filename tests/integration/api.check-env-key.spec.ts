import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockRequest, createMockResponse, mockApiKeyHeaders } from '~/lib/testing/test-helpers';
import { LLMManager } from '~/lib/modules/llm/manager';
import { loader } from '~/routes/api.check-env-key';

describe('api.check-env-key', () => {
  beforeEach(() => {
    // Reset the LLMManager singleton so env state doesn't leak between tests
    (LLMManager as any)._instance = null;
    LLMManager.getInstance({});
  });

  afterEach(() => {
    (LLMManager as any)._instance = null;
    vi.restoreAllMocks();
  });

  it('returns { isSet: false } when no provider param is given', async () => {
    const request = createMockRequest({ url: 'https://test.example.com/api/check-env-key' });
    const response = await createMockResponse(
      loader({ request, context: { cloudflare: { env: {} } }, params: {} } as any) as unknown as Response,
    );

    expect(response.status).toBe(200);
    expect(response.bodyJson).toEqual({ isSet: false });
  });

  it('returns { isSet: false } for an unknown provider', async () => {
    const request = createMockRequest({
      url: 'https://test.example.com/api/check-env-key?provider=UnknownProvider',
    });
    const response = await createMockResponse(
      loader({ request, context: { cloudflare: { env: {} } }, params: {} } as any) as unknown as Response,
    );

    expect(response.status).toBe(200);
    expect(response.bodyJson).toEqual({ isSet: false });
  });

  it('returns { isSet: true } when the API key is in the request header', async () => {
    const headers = mockApiKeyHeaders({ OpenAI: 'sk-test-fake-key-aaaaaaaaaaaa' });
    const request = createMockRequest({
      url: 'https://test.example.com/api/check-env-key?provider=OpenAI',
      headers,
    });
    const response = await createMockResponse(
      loader({ request, context: { cloudflare: { env: {} } }, params: {} } as any) as unknown as Response,
    );

    expect(response.status).toBe(200);
    expect(response.bodyJson).toEqual({ isSet: true });
  });

  it('returns { isSet: true } when the API key is in the Cloudflare env', async () => {
    const request = createMockRequest({
      url: 'https://test.example.com/api/check-env-key?provider=OpenAI',
    });
    const response = await createMockResponse(
      loader({
        request,
        context: { cloudflare: { env: { OPENAI_API_KEY: 'sk-test-env-key-bbbbbbbbbbbb' } } },
        params: {},
      } as any) as unknown as Response,
    );

    expect(response.status).toBe(200);
    expect(response.bodyJson).toEqual({ isSet: true });
  });

  it('returns { isSet: true } when the API key is in process.env', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-process-env-key-cccccccc';

    try {
      const request = createMockRequest({
        url: 'https://test.example.com/api/check-env-key?provider=OpenAI',
      });
      const response = await createMockResponse(
        loader({ request, context: { cloudflare: { env: {} } }, params: {} } as any) as unknown as Response,
      );

      expect(response.status).toBe(200);
      expect(response.bodyJson).toEqual({ isSet: true });
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it('returns { isSet: false } when no key is set anywhere for a known provider', async () => {
    const request = createMockRequest({
      url: 'https://test.example.com/api/check-env-key?provider=OpenAI',
    });
    const response = await createMockResponse(
      loader({ request, context: { cloudflare: { env: {} } }, params: {} } as any) as unknown as Response,
    );

    expect(response.status).toBe(200);
    expect(response.bodyJson).toEqual({ isSet: false });
  });

  it('returns { isSet: false } for a provider with empty-string API key in header', async () => {
    // Empty-string values are filtered out by getApiKeysFromRequest
    const headers = mockApiKeyHeaders({ OpenAI: '' });
    const request = createMockRequest({
      url: 'https://test.example.com/api/check-env-key?provider=OpenAI',
      headers,
    });
    const response = await createMockResponse(
      loader({ request, context: { cloudflare: { env: {} } }, params: {} } as any) as unknown as Response,
    );

    expect(response.status).toBe(200);
    expect(response.bodyJson).toEqual({ isSet: false });
  });
});