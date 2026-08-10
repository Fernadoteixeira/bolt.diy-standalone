import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCerebras } from '@ai-sdk/cerebras';
import CerebrasProvider from '~/lib/modules/llm/providers/cerebras';

// cspell:words cerebras Cerebras Qwen Llama

// Mock the Cerebras SDK so no real API client is created.
vi.mock('@ai-sdk/cerebras', () => ({
  createCerebras: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'cerebras' }))),
}));

// Mock fetch globally so no real network calls are made.
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('CerebrasProvider', () => {
  let provider: CerebrasProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CerebrasProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('Cerebras');
      expect(provider.getApiKeyLink).toBe('https://cloud.cerebras.ai/settings');
    });

    it('should use CEREBRAS_API_KEY as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('CEREBRAS_API_KEY');
    });

    it('should include Qwen3-Coder, Llama 3.1 8B, and GPT OSS 120B as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('qwen3-coder-480b');
      expect(ids).toContain('llama3.1-8b');
      expect(ids).toContain('gpt-oss-120b');
    });

    it('should set 262k context for Qwen3-Coder 480B', () => {
      const model = provider.staticModels.find((m) => m.name === 'qwen3-coder-480b');
      expect(model?.maxTokenAllowed).toBe(262000);
    });

    it('should set 8k context for Llama 3.1 8B and GPT OSS 120B', () => {
      const llama = provider.staticModels.find((m) => m.name === 'llama3.1-8b');
      const gptOss = provider.staticModels.find((m) => m.name === 'gpt-oss-120b');
      expect(llama?.maxTokenAllowed).toBe(8000);
      expect(gptOss?.maxTokenAllowed).toBe(8000);
    });

    it('should set all static model providers to Cerebras', () => {
      for (const model of provider.staticModels) {
        expect(model.provider).toBe('Cerebras');
      }
    });
  });

  describe('getDynamicModels', () => {
    const apiKeys = { Cerebras: 'cerebras-test-key' };

    it('should return an empty list when no API key is configured', async () => {
      const models = await provider.getDynamicModels({}, undefined, {});
      expect(models).toEqual([]);
    });

    it('should fetch models from the Cerebras API with Authorization header and timeout signal', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await provider.getDynamicModels(apiKeys, undefined, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cerebras.ai/v1/models',
        expect.objectContaining({
          headers: { Authorization: 'Bearer cerebras-test-key' },
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
            { id: 'qwen3-coder-480b' },
            { id: 'new-cerebras-model' },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('new-cerebras-model');
    });

    it('should label dynamic models with "(Dynamic)" and set 32000 context', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'new-model-x' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].label).toBe('new-model-x (Dynamic)');
      expect(models[0].maxTokenAllowed).toBe(32000);
      expect(models[0].provider).toBe('Cerebras');
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

    it('should handle a missing data field gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});
      expect(models).toEqual([]);
    });
  });

  describe('getModelInstance', () => {
    it('should throw when no API key is configured', () => {
      expect(() =>
        provider.getModelInstance({
          model: 'llama3.1-8b',
          serverEnv: {} as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing API key for Cerebras provider');
    });

    it('should return a model instance for the requested model', () => {
      const instance = provider.getModelInstance({
        model: 'llama3.1-8b',
        serverEnv: {} as any,
        apiKeys: { Cerebras: 'cerebras-test-key' },
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('llama3.1-8b');
    });

    it('should pass the API key to createCerebras', () => {
      provider.getModelInstance({
        model: 'qwen3-coder-480b',
        serverEnv: {} as any,
        apiKeys: { Cerebras: 'cerebras-my-key' },
        providerSettings: {},
      });

      expect(vi.mocked(createCerebras)).toHaveBeenCalledWith({ apiKey: 'cerebras-my-key' });
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      provider.getModelInstance({
        model: 'llama3.1-8b',
        serverEnv: { CEREBRAS_API_KEY: 'cerebras-env-key' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(vi.mocked(createCerebras)).toHaveBeenCalledWith({ apiKey: 'cerebras-env-key' });
    });
  });
});