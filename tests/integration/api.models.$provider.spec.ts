import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '~/lib/testing/test-helpers';
import { LLMManager } from '~/lib/modules/llm/manager';
import { loader } from '~/routes/api.models.$provider';

describe('api.models.$provider', () => {
  beforeEach(() => {
    (LLMManager as any)._instance = null;
    LLMManager.getInstance({});
  });

  afterEach(() => {
    (LLMManager as any)._instance = null;
    vi.restoreAllMocks();
  });

  it('returns an empty modelList when no provider param is given', async () => {
    const request = createMockRequest({ url: 'https://test.example.com/api/models' });
    const response = await createMockResponse(
      loader({ request, params: {}, context: { cloudflare: { env: {} } } }),
    );

    expect(response.status).toBe(200);
    const body = response.bodyJson as any;
    expect(body.modelList).toEqual([]);
    expect(body).toHaveProperty('providers');
    expect(body).toHaveProperty('defaultProvider');
  });

  it('returns 404 when the provider is not found', async () => {
    const request = createMockRequest({ url: 'https://test.example.com/api/models/Unknown' });
    const response = await createMockResponse(
      loader({ request, params: { provider: 'Unknown' }, context: { cloudflare: { env: {} } } }),
    );

    expect(response.status).toBe(404);
    expect(response.bodyJson).toEqual({ error: 'Unknown provider: Unknown' });
  });

  it('returns models for a known provider (OpenAI)', async () => {
    const request = createMockRequest({ url: 'https://test.example.com/api/models/OpenAI' });
    const response = await createMockResponse(
      loader({ request, params: { provider: 'OpenAI' }, context: { cloudflare: { env: {} } } }),
    );

    expect(response.status).toBe(200);
    const body = response.bodyJson as any;
    expect(body).toHaveProperty('modelList');
    expect(body).toHaveProperty('providers');
    expect(body).toHaveProperty('defaultProvider');
    // Without API keys, dynamic model fetching fails and we get static models
    expect(body.modelList.length).toBeGreaterThan(0);

    // All returned models should belong to the OpenAI provider
    for (const model of body.modelList) {
      expect(model.provider).toBe('OpenAI');
    }
  });

  it('returns models that include static models for the specified provider', async () => {
    const request = createMockRequest({ url: 'https://test.example.com/api/models/Anthropic' });
    const response = await createMockResponse(
      loader({ request, params: { provider: 'Anthropic' }, context: { cloudflare: { env: {} } } }),
    );

    expect(response.status).toBe(200);
    const body = response.bodyJson as any;
    expect(body.modelList.length).toBeGreaterThan(0);

    // Verify at least one model has the Anthropic provider
    const hasAnthropicModel = body.modelList.some((m: any) => m.provider === 'Anthropic');
    expect(hasAnthropicModel).toBe(true);
  });
});