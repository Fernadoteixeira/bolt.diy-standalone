import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFireworks } from '@ai-sdk/fireworks';
import FireworksProvider from '~/lib/modules/llm/providers/fireworks';

// cspell:words fireworks Fireworks Qwen Llama DeepSeek

// Mock the Fireworks SDK so no real API client is created.
vi.mock('@ai-sdk/fireworks', () => ({
  createFireworks: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'fireworks' }))),
}));

// Mock fetch globally so no real network calls are made.
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('FireworksProvider', () => {
  let provider: FireworksProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new FireworksProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('Fireworks');
      expect(provider.getApiKeyLink).toBe('https://fireworks.ai/api-keys');
    });

    it('should use FIREWORKS_API_KEY as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('FIREWORKS_API_KEY');
    });

    it('should include Qwen3-Coder 480B, Llama 3.1 405B, and DeepSeek R1 as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('accounts/fireworks/models/qwen3-coder-480b-a35b-instruct');
      expect(ids).toContain('accounts/fireworks/models/llama-v3p1-405b-instruct');
      expect(ids).toContain('accounts/fireworks/models/deepseek-r1');
    });

    it('should set 262k context for Qwen3-Coder models', () => {
      const coder480b = provider.staticModels.find(
        (m) => m.name === 'accounts/fireworks/models/qwen3-coder-480b-a35b-instruct',
      );
      const coder30b = provider.staticModels.find(
        (m) => m.name === 'accounts/fireworks/models/qwen3-coder-30b-a3b-instruct',
      );
      expect(coder480b?.maxTokenAllowed).toBe(262000);
      expect(coder30b?.maxTokenAllowed).toBe(262000);
    });

    it('should set 128k context for Llama 3.1 models', () => {
      const llama405b = provider.staticModels.find(
        (m) => m.name === 'accounts/fireworks/models/llama-v3p1-405b-instruct',
      );
      expect(llama405b?.maxTokenAllowed).toBe(128000);
    });

    it('should set 64k context for DeepSeek R1', () => {
      const r1 = provider.staticModels.find((m) => m.name === 'accounts/fireworks/models/deepseek-r1');
      expect(r1?.maxTokenAllowed).toBe(64000);
    });

    it('should set all static model providers to Fireworks', () => {
      for (const model of provider.staticModels) {
        expect(model.provider).toBe('Fireworks');
      }
    });
  });

  describe('getDynamicModels', () => {
    const apiKeys = { Fireworks: 'fireworks-test-key' };

    it('should return an empty list when no API key is configured', async () => {
      const models = await provider.getDynamicModels({}, undefined, {});
      expect(models).toEqual([]);
    });

    it('should fetch models from the Fireworks API with Authorization header and timeout signal', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await provider.getDynamicModels(apiKeys, undefined, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.fireworks.ai/v1/accounts/fireworks/models?page_size=100',
        expect.objectContaining({
          headers: { Authorization: 'Bearer fireworks-test-key' },
        }),
      );
      const callArgs = mockFetch.mock.calls[0][1] as any;
      expect(callArgs.signal).toBeDefined();
    });

    it('should filter out models already in staticModels', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'qwen3-coder-480b-a35b-instruct' },
            { id: 'new-fireworks-model' },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('accounts/fireworks/models/new-fireworks-model');
    });

    it('should prefix dynamic model ids with accounts/fireworks/models/', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'new-model-x' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].name).toBe('accounts/fireworks/models/new-model-x');
      expect(models[0].label).toBe('new-model-x (Dynamic)');
      expect(models[0].provider).toBe('Fireworks');
    });

    it('should use context_length from API response when available', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'ctx-model', context_length: 64000 }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(64000);
    });

    it('should default context to 128000 when context_length is not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'no-ctx-model' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(128000);
    });

    it('should return an empty list when the API responds with an HTTP error', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});
      expect(models).toEqual([]);
    });

    it('should return an empty list when the fetch fails (network error)', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      const models = await provider.getDynamicModels(apiKeys, undefined, {});
      expect(models).toEqual([]);
    });
  });

  describe('getModelInstance', () => {
    it('should throw when no API key is configured', () => {
      expect(() =>
        provider.getModelInstance({
          model: 'accounts/fireworks/models/qwen3-coder-480b-a35b-instruct',
          serverEnv: {} as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing API key for Fireworks provider');
    });

    it('should return a model instance for the requested model', () => {
      const instance = provider.getModelInstance({
        model: 'accounts/fireworks/models/llama-v3p1-405b-instruct',
        serverEnv: {} as any,
        apiKeys: { Fireworks: 'fireworks-test-key' },
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('accounts/fireworks/models/llama-v3p1-405b-instruct');
    });

    it('should pass the API key to createFireworks', () => {
      provider.getModelInstance({
        model: 'accounts/fireworks/models/deepseek-r1',
        serverEnv: {} as any,
        apiKeys: { Fireworks: 'fireworks-my-key' },
        providerSettings: {},
      });

      expect(vi.mocked(createFireworks)).toHaveBeenCalledWith({ apiKey: 'fireworks-my-key' });
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      provider.getModelInstance({
        model: 'accounts/fireworks/models/deepseek-r1',
        serverEnv: { FIREWORKS_API_KEY: 'fireworks-env-key' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(vi.mocked(createFireworks)).toHaveBeenCalledWith({ apiKey: 'fireworks-env-key' });
    });
  });
});