import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '~/lib/testing/test-helpers';
import { LLMManager } from '~/lib/modules/llm/manager';
import { loader } from '~/routes/api.models';

describe('api.models', () => {
  beforeEach(() => {
    (LLMManager as any)._instance = null;
    LLMManager.getInstance({});
  });

  afterEach(() => {
    (LLMManager as any)._instance = null;
    vi.restoreAllMocks();
  });

  it('returns a response with modelList, providers, and defaultProvider', async () => {
    const request = createMockRequest({ url: 'https://test.example.com/api/models' });
    const response = await createMockResponse(
      loader({ request, params: {}, context: { cloudflare: { env: {} } } }),
    );

    expect(response.status).toBe(200);
    const body = response.bodyJson as any;
    expect(body).toHaveProperty('modelList');
    expect(body).toHaveProperty('providers');
    expect(body).toHaveProperty('defaultProvider');
    expect(Array.isArray(body.modelList)).toBe(true);
    expect(Array.isArray(body.providers)).toBe(true);
    expect(typeof body.defaultProvider).toBe('object');
  });

  it('returns a non-empty modelList containing static models from registered providers', async () => {
    const request = createMockRequest({ url: 'https://test.example.com/api/models' });
    const response = await createMockResponse(
      loader({ request, params: {}, context: { cloudflare: { env: {} } } }),
    );

    expect(response.status).toBe(200);
    const body = response.bodyJson as any;
    // Static models from all registered providers should be present
    expect(body.modelList.length).toBeGreaterThan(0);

    // Each model should have required fields
    const model = body.modelList[0];
    expect(model).toHaveProperty('name');
    expect(model).toHaveProperty('label');
    expect(model).toHaveProperty('provider');
    expect(model).toHaveProperty('maxTokenAllowed');
  });

  it('returns providers with expected info fields', async () => {
    const request = createMockRequest({ url: 'https://test.example.com/api/models' });
    const response = await createMockResponse(
      loader({ request, params: {}, context: { cloudflare: { env: {} } } }),
    );

    expect(response.status).toBe(200);
    const body = response.bodyJson as any;
    expect(body.providers.length).toBeGreaterThan(0);

    const provider = body.providers[0];
    expect(provider).toHaveProperty('name');
    expect(provider).toHaveProperty('staticModels');
  });

  it('returns a defaultProvider with a name', async () => {
    const request = createMockRequest({ url: 'https://test.example.com/api/models' });
    const response = await createMockResponse(
      loader({ request, params: {}, context: { cloudflare: { env: {} } } }),
    );

    expect(response.status).toBe(200);
    const body = response.bodyJson as any;
    expect(body.defaultProvider).toHaveProperty('name');
    expect(typeof body.defaultProvider.name).toBe('string');
    expect(body.defaultProvider.name.length).toBeGreaterThan(0);
  });
});