import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockRequest, createMockResponse, mockApiKeyHeaders } from '~/lib/testing/test-helpers';
import { LLMManager } from '~/lib/modules/llm/manager';
import { loader } from '~/routes/api.export-api-keys';

describe('api.export-api-keys', () => {
  beforeEach(() => {
    (LLMManager as any)._instance = null;
    LLMManager.getInstance({});
  });

  afterEach(() => {
    (LLMManager as any)._instance = null;
    vi.restoreAllMocks();
  });

  it('returns an empty object when no API keys are set anywhere', async () => {
    const request = createMockRequest({ url: 'https://test.example.com/api/export-api-keys' });
    const response = await createMockResponse(
      loader({ request, context: { cloudflare: { env: {} } }, params: {} } as any) as unknown as Response,
    );

    expect(response.status).toBe(200);
    expect(response.bodyJson).toEqual({});
  });

  it('returns API keys from the request header', async () => {
    const headers = mockApiKeyHeaders({ OpenAI: 'sk-test-header-key-aaaaaaaaaaaa' });
    const request = createMockRequest({
      url: 'https://test.example.com/api/export-api-keys',
      headers,
    });
    const response = await createMockResponse(
      loader({ request, context: { cloudflare: { env: {} } }, params: {} } as any) as unknown as Response,
    );

    expect(response.status).toBe(200);
    expect(response.bodyJson).toEqual({ OpenAI: 'sk-test-header-key-aaaaaaaaaaaa' });
  });

  it('returns API keys from the Cloudflare env', async () => {
    const request = createMockRequest({ url: 'https://test.example.com/api/export-api-keys' });
    const response = await createMockResponse(
      loader({
        request,
        context: { cloudflare: { env: { OPENAI_API_KEY: 'sk-test-env-key-bbbbbbbbbbbb' } } },
        params: {},
      } as any) as unknown as Response,
    );

    expect(response.status).toBe(200);
    expect(response.bodyJson).toEqual({ OpenAI: 'sk-test-env-key-bbbbbbbbbbbb' });
  });

  it('merges API keys from request header and env (header takes precedence)', async () => {
    const headers = mockApiKeyHeaders({ OpenAI: 'sk-test-header-key-aaaaaaaaaaaa' });
    const request = createMockRequest({
      url: 'https://test.example.com/api/export-api-keys',
      headers,
    });
    const response = await createMockResponse(
      loader({
        request,
        context: { cloudflare: { env: { OPENAI_API_KEY: 'sk-test-env-key-bbbbbbbbbbbb' } } },
        params: {},
      } as any) as unknown as Response,
    );

    expect(response.status).toBe(200);
    const body = response.bodyJson as Record<string, string>;
    // Header key takes precedence — the loader starts with header keys and
    // only adds env keys for providers not already present.
    expect(body.OpenAI).toBe('sk-test-header-key-aaaaaaaaaaaa');
  });

  it('returns multiple env keys for different providers', async () => {
    const request = createMockRequest({ url: 'https://test.example.com/api/export-api-keys' });
    const response = await createMockResponse(
      loader({
        request,
        context: {
          cloudflare: {
            env: {
              OPENAI_API_KEY: 'sk-test-openai-key-aaaaaaaaaaaa',
              ANTHROPIC_API_KEY: 'sk-ant-test-anthropic-key-bbbbbbbbb',
            },
          },
        },
        params: {},
      } as any) as unknown as Response,
    );

    expect(response.status).toBe(200);
    const body = response.bodyJson as Record<string, string>;
    expect(body.OpenAI).toBe('sk-test-openai-key-aaaaaaaaaaaa');
    expect(body.Anthropic).toBe('sk-ant-test-anthropic-key-bbbbbbbbb');
  });
});