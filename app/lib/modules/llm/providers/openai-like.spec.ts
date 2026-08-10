import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OpenAILikeProvider from '~/lib/modules/llm/providers/openai-like';

// cspell:words openai OpenAI

// Mock the OpenAI SDK so getOpenAILikeModel (which calls createOpenAI) doesn't make real calls.
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'openai-like' }))),
}));

// Mock fetch globally so no real network calls are made.
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('OpenAILikeProvider', () => {
  let provider: OpenAILikeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAILikeProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name', () => {
      expect(provider.name).toBe('OpenAILike');
    });

    it('should not have an API key link (getApiKeyLink is undefined)', () => {
      expect(provider.getApiKeyLink).toBeUndefined();
    });

    it('should use OPENAI_LIKE_API_BASE_URL and OPENAI_LIKE_API_KEY as config keys', () => {
      expect(provider.config.baseUrlKey).toBe('OPENAI_LIKE_API_BASE_URL');
      expect(provider.config.apiTokenKey).toBe('OPENAI_LIKE_API_KEY');
    });

    it('should have an empty staticModels array', () => {
      expect(provider.staticModels).toEqual([]);
    });
  });

  describe('getDynamicModels', () => {
    it('should return an empty list when no baseUrl or apiKey is configured', async () => {
      const models = await provider.getDynamicModels({}, undefined, {});
      expect(models).toEqual([]);
    });

    it('should return an empty list when only baseUrl is configured but no apiKey', async () => {
      const models = await provider.getDynamicModels(
        {},
        { baseUrl: 'http://localhost:8080' } as any,
        {},
      );
      expect(models).toEqual([]);
    });

    it('should fetch models from {baseUrl}/models with Authorization header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const apiKeys = { OpenAILike: 'like-test-key' };
      const settings = { baseUrl: 'http://localhost:8080' } as any;

      await provider.getDynamicModels(apiKeys, settings, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/models',
        expect.objectContaining({
          headers: { Authorization: 'Bearer like-test-key' },
        }),
      );
    });

    it('should pass a timeout signal to fetch', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const apiKeys = { OpenAILike: 'like-test-key' };
      const settings = { baseUrl: 'http://localhost:8080' } as any;

      await provider.getDynamicModels(apiKeys, settings, {});

      const callArgs = mockFetch.mock.calls[0][1] as any;
      expect(callArgs.signal).toBeDefined();
    });

    it('should map the response data to ModelInfo objects', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'model-a' }, { id: 'model-b' }],
        }),
      });

      const apiKeys = { OpenAILike: 'like-test-key' };
      const settings = { baseUrl: 'http://localhost:8080' } as any;

      const models = await provider.getDynamicModels(apiKeys, settings, {});

      expect(models).toHaveLength(2);
      expect(models[0].name).toBe('model-a');
      expect(models[0].label).toBe('model-a');
      expect(models[0].provider).toBe('OpenAILike');
      expect(models[0].maxTokenAllowed).toBe(8000);
    });

    it('should strip trailing slash from baseUrl before fetching', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const apiKeys = { OpenAILike: 'like-test-key' };
      const settings = { baseUrl: 'http://localhost:8080/' } as any;

      await provider.getDynamicModels(apiKeys, settings, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/models',
        expect.anything(),
      );
    });

    it('should return an empty list when the HTTP response is not ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const apiKeys = { OpenAILike: 'like-test-key' };
      const settings = { baseUrl: 'http://localhost:8080' } as any;

      const models = await provider.getDynamicModels(apiKeys, settings, {});
      expect(models).toEqual([]);
    });

    it('should fall back to OPENAI_LIKE_API_MODELS env when fetch fails', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      const serverEnv = {
        OPENAI_LIKE_API_BASE_URL: 'http://localhost:8080',
        OPENAI_LIKE_API_KEY: 'like-test-key',
        OPENAI_LIKE_API_MODELS: 'model-a:8000;model-b:16000;model-c',
      };

      const models = await provider.getDynamicModels({}, undefined, serverEnv);

      expect(models).toHaveLength(3);
      expect(models[0].name).toBe('model-a');
      expect(models[0].maxTokenAllowed).toBe(8000);
      expect(models[1].name).toBe('model-b');
      expect(models[1].maxTokenAllowed).toBe(16000);
      expect(models[2].name).toBe('model-c');
      expect(models[2].maxTokenAllowed).toBe(8000); // default when no limit specified
    });

    it('should fall back to OPENAI_LIKE_API_MODELS from settings when fetch fails', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      const serverEnv = {
        OPENAI_LIKE_API_BASE_URL: 'http://localhost:8080',
        OPENAI_LIKE_API_KEY: 'like-test-key',
      };
      const settings = {
        baseUrl: 'http://localhost:8080',
        OPENAI_LIKE_API_MODELS: 'custom-model:32000',
      } as any;

      const models = await provider.getDynamicModels({}, settings, serverEnv);

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('custom-model');
      expect(models[0].maxTokenAllowed).toBe(32000);
    });

    it('should return an empty list when fetch fails and no fallback env is available', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      const serverEnv = {
        OPENAI_LIKE_API_BASE_URL: 'http://localhost:8080',
        OPENAI_LIKE_API_KEY: 'like-test-key',
      };

      const models = await provider.getDynamicModels({}, undefined, serverEnv);
      expect(models).toEqual([]);
    });

    it('should normalize OPENAI_API_BASE_URLS alias to OPENAI_LIKE_API_BASE_URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const serverEnv = {
        OPENAI_API_BASE_URLS: 'http://localhost:9090,http://localhost:8080',
        OPENAI_LIKE_API_KEY: 'like-test-key',
      };

      await provider.getDynamicModels({}, undefined, serverEnv);

      // Should use the first URL from the comma-separated list
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:9090/models',
        expect.anything(),
      );
    });

    it('should normalize OPENAI_API_KEYS alias to OPENAI_LIKE_API_KEY', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const serverEnv = {
        OPENAI_LIKE_API_BASE_URL: 'http://localhost:8080',
        OPENAI_API_KEYS: 'key1\nkey2',
      };

      await provider.getDynamicModels({}, undefined, serverEnv);

      const callArgs = mockFetch.mock.calls[0][1] as any;
      expect(callArgs.headers.Authorization).toBe('Bearer key1');
    });

    it('should prefer OPENAI_LIKE_API_BASE_URL over the alias', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const serverEnv = {
        OPENAI_LIKE_API_BASE_URL: 'http://preferred:8080',
        OPENAI_API_BASE_URLS: 'http://alias:9090',
        OPENAI_LIKE_API_KEY: 'like-test-key',
      };

      await provider.getDynamicModels({}, undefined, serverEnv);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://preferred:8080/models',
        expect.anything(),
      );
    });

    it('should generate readable labels from model paths', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      const serverEnv = {
        OPENAI_LIKE_API_BASE_URL: 'http://localhost:8080',
        OPENAI_LIKE_API_KEY: 'like-test-key',
        OPENAI_LIKE_API_MODELS: 'accounts/fireworks/models/my-cool-model:8000',
      };

      const models = await provider.getDynamicModels({}, undefined, serverEnv);

      expect(models).toHaveLength(1);
      // The label is generated from the last part of the path: "my-cool-model" → "My-Cool-Model (OpenAI Compatible)"
      expect(models[0].label).toContain('My-Cool-Model');
    });

    it('should handle empty entries in OPENAI_LIKE_API_MODELS gracefully', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      const serverEnv = {
        OPENAI_LIKE_API_BASE_URL: 'http://localhost:8080',
        OPENAI_LIKE_API_KEY: 'like-test-key',
        OPENAI_LIKE_API_MODELS: '; ;model-a:8000;;',
      };

      const models = await provider.getDynamicModels({}, undefined, serverEnv);

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('model-a');
    });

    it('should set provider to OpenAILike for all dynamic models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'test-model' }],
        }),
      });

      const apiKeys = { OpenAILike: 'like-test-key' };
      const settings = { baseUrl: 'http://localhost:8080' } as any;

      const models = await provider.getDynamicModels(apiKeys, settings, {});

      expect(models[0].provider).toBe('OpenAILike');
    });
  });

  describe('getModelInstance', () => {
    it('should throw when no baseUrl or apiKey is configured', () => {
      expect(() =>
        provider.getModelInstance({
          model: 'some-model',
          serverEnv: {} as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing configuration for OpenAILike provider');
    });

    it('should throw when only baseUrl is configured but no apiKey', () => {
      expect(() =>
        provider.getModelInstance({
          model: 'some-model',
          serverEnv: { OPENAI_LIKE_API_BASE_URL: 'http://localhost:8080' } as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing configuration for OpenAILike provider');
    });

    it('should return a model instance when baseUrl and apiKey are configured', () => {
      const instance = provider.getModelInstance({
        model: 'some-model',
        serverEnv: {
          OPENAI_LIKE_API_BASE_URL: 'http://localhost:8080',
          OPENAI_LIKE_API_KEY: 'like-test-key',
        } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('some-model');
    });

    it('should resolve baseUrl and apiKey from apiKeys with provider name', () => {
      const instance = provider.getModelInstance({
        model: 'some-model',
        serverEnv: {} as any,
        apiKeys: { OpenAILike: 'like-api-key' },
        providerSettings: {
          OpenAILike: { baseUrl: 'http://from-settings:8080' } as any,
        },
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('some-model');
    });
  });
});