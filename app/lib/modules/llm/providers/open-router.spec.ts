import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import OpenRouterProvider from '~/lib/modules/llm/providers/open-router';

// cspell:words openrouter OpenRouter

// Mock the OpenRouter SDK so no real API client is created.
vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: vi.fn(() => ({
    chat: vi.fn((model: string) => ({ modelId: model, provider: 'openrouter' })),
  })),
}));

// Mock fetch globally so no real network calls are made.
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenRouterProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('OpenRouter');
      expect(provider.getApiKeyLink).toBe('https://openrouter.ai/settings/keys');
    });

    it('should use OPEN_ROUTER_API_KEY as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('OPEN_ROUTER_API_KEY');
    });

    it('should include Claude 3.5 Sonnet and GPT-4o as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('anthropic/claude-3.5-sonnet');
      expect(ids).toContain('openai/gpt-4o');
    });

    it('should set 200k context for Claude 3.5 Sonnet', () => {
      const claude = provider.staticModels.find((m) => m.name === 'anthropic/claude-3.5-sonnet');
      expect(claude?.maxTokenAllowed).toBe(200000);
    });

    it('should set 128k context for GPT-4o', () => {
      const gpt4o = provider.staticModels.find((m) => m.name === 'openai/gpt-4o');
      expect(gpt4o?.maxTokenAllowed).toBe(128000);
    });

    it('should set all static model providers to OpenRouter', () => {
      for (const model of provider.staticModels) {
        expect(model.provider).toBe('OpenRouter');
      }
    });
  });

  describe('getDynamicModels', () => {
    it('should fetch models from the OpenRouter public API without requiring an API key', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const models = await provider.getDynamicModels({}, undefined, {});
      expect(models).toEqual([]);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/models',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should map models with id, label, and context from API response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'test/model',
              name: 'Test Model',
              context_length: 32000,
              pricing: { prompt: 0, completion: 0 },
            },
          ],
        }),
      });

      const models = await provider.getDynamicModels({}, undefined, {});

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('test/model');
      expect(models[0].label).toContain('Test Model');
      expect(models[0].label).toContain('32k');
      expect(models[0].provider).toBe('OpenRouter');
      expect(models[0].maxTokenAllowed).toBe(32000);
    });

    it('should sort models by name', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'z-model', name: 'Z Model', context_length: 32000, pricing: { prompt: 0, completion: 0 } },
            { id: 'a-model', name: 'A Model', context_length: 32000, pricing: { prompt: 0, completion: 0 } },
          ],
        }),
      });

      const models = await provider.getDynamicModels({}, undefined, {});

      expect(models[0].name).toBe('a-model');
      expect(models[1].name).toBe('z-model');
    });

    it('should include pricing info in the label', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'priced-model',
              name: 'Priced Model',
              context_length: 32000,
              pricing: { prompt: 0.000001, completion: 0.000002 },
            },
          ],
        }),
      });

      const models = await provider.getDynamicModels({}, undefined, {});

      expect(models[0].label).toContain('in:$1.00');
      expect(models[0].label).toContain('out:$2.00');
    });

    it('should default context to 32000 when context_length is 0', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'no-ctx', name: 'No Context', context_length: 0, pricing: { prompt: 0, completion: 0 } },
          ],
        }),
      });

      const models = await provider.getDynamicModels({}, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(32000);
    });

    it('should cap context at 1,000,000 tokens', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'huge-model', name: 'Huge Model', context_length: 2000000, pricing: { prompt: 0, completion: 0 } },
          ],
        }),
      });

      const models = await provider.getDynamicModels({}, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(1000000);
      expect(models[0].label).toContain('1M');
    });

    it('should return an empty list when the fetch fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      const models = await provider.getDynamicModels({}, undefined, {});
      expect(models).toEqual([]);
    });
  });

  describe('getModelInstance', () => {
    it('should throw when no API key is configured', () => {
      expect(() =>
        provider.getModelInstance({
          model: 'anthropic/claude-3.5-sonnet',
          serverEnv: {} as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing API key for OpenRouter provider');
    });

    it('should return a model instance for the requested model', () => {
      const instance = provider.getModelInstance({
        model: 'anthropic/claude-3.5-sonnet',
        serverEnv: {} as any,
        apiKeys: { OpenRouter: 'or-test-key' },
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('anthropic/claude-3.5-sonnet');
    });

    it('should pass the API key to createOpenRouter', () => {
      provider.getModelInstance({
        model: 'openai/gpt-4o',
        serverEnv: {} as any,
        apiKeys: { OpenRouter: 'or-my-key' },
        providerSettings: {},
      });

      expect(vi.mocked(createOpenRouter)).toHaveBeenCalledWith({ apiKey: 'or-my-key' });
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      provider.getModelInstance({
        model: 'anthropic/claude-3.5-sonnet',
        serverEnv: { OPEN_ROUTER_API_KEY: 'or-env-key' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(vi.mocked(createOpenRouter)).toHaveBeenCalledWith({ apiKey: 'or-env-key' });
    });
  });
});