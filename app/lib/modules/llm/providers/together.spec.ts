import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TogetherProvider from '~/lib/modules/llm/providers/together';

// cspell:words together Together

// Mock the OpenAI SDK so getOpenAILikeModel (which calls createOpenAI) doesn't make real calls.
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'together' }))),
}));

// Mock fetch globally so no real network calls are made.
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('TogetherProvider', () => {
  let provider: TogetherProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new TogetherProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('Together');
      expect(provider.getApiKeyLink).toBe('https://api.together.xyz/settings/api-keys');
    });

    it('should use TOGETHER_API_BASE_URL and TOGETHER_API_KEY as config keys', () => {
      expect(provider.config.baseUrlKey).toBe('TOGETHER_API_BASE_URL');
      expect(provider.config.apiTokenKey).toBe('TOGETHER_API_KEY');
    });

    it('should include Llama 3.2 90B Vision and Mixtral 8x7B as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo');
      expect(ids).toContain('mistralai/Mixtral-8x7B-Instruct-v0.1');
    });

    it('should set 128k context for Llama 3.2 90B Vision', () => {
      const model = provider.staticModels.find((m) => m.name === 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo');
      expect(model?.maxTokenAllowed).toBe(128000);
    });

    it('should set 32k context for Mixtral 8x7B', () => {
      const model = provider.staticModels.find((m) => m.name === 'mistralai/Mixtral-8x7B-Instruct-v0.1');
      expect(model?.maxTokenAllowed).toBe(32000);
    });
  });

  describe('getDynamicModels', () => {
    const apiKeys = { Together: 'together-test-key' };

    it('should return an empty list when no apiKey is configured', async () => {
      const models = await provider.getDynamicModels({}, undefined, {});
      expect(models).toEqual([]);
    });

    it('should use the default base URL when no custom base URL is configured', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      await provider.getDynamicModels(apiKeys, undefined, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.together.xyz/v1/models',
        expect.objectContaining({
          headers: { Authorization: 'Bearer together-test-key' },
        }),
      );
    });

    it('should use the custom base URL from serverEnv when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      const serverEnv = { TOGETHER_API_BASE_URL: 'https://custom.together.api/v1' };
      await provider.getDynamicModels(apiKeys, undefined, serverEnv);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.together.api/v1/models',
        expect.anything(),
      );
    });

    it('should only include models with type "chat"', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 'chat-model',
            display_name: 'Chat Model',
            type: 'chat',
            pricing: { input: 0.001, output: 0.002 },
            context_length: 32000,
          },
          {
            id: 'embed-model',
            display_name: 'Embed Model',
            type: 'embedding',
            pricing: { input: 0.001, output: 0.002 },
            context_length: 32000,
          },
        ],
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('chat-model');
    });

    it('should format label with display name, pricing, and context length', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 'test-model',
            display_name: 'Test Model',
            type: 'chat',
            pricing: { input: 0.001, output: 0.002 },
            context_length: 32000,
          },
        ],
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].label).toContain('Test Model');
      expect(models[0].label).toContain('$0.00');
      expect(models[0].label).toContain('32k');
    });

    it('should set maxTokenAllowed to 8000 and maxCompletionTokens to 8192 for dynamic models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 'test-model',
            display_name: 'Test',
            type: 'chat',
            pricing: { input: 0.001, output: 0.002 },
            context_length: 128000,
          },
        ],
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(8000);
      expect(models[0].maxCompletionTokens).toBe(8192);
    });

    it('should set provider to Together for all dynamic models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 'test-model',
            display_name: 'Test',
            type: 'chat',
            pricing: { input: 0.001, output: 0.002 },
            context_length: 32000,
          },
        ],
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].provider).toBe('Together');
    });
  });

  describe('getModelInstance', () => {
    it('should throw when no baseUrl or apiKey is configured', () => {
      expect(() =>
        provider.getModelInstance({
          model: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
          serverEnv: {} as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing configuration for Together provider');
    });

    it('should throw when only apiKey is provided but no baseUrl', () => {
      expect(() =>
        provider.getModelInstance({
          model: 'test-model',
          serverEnv: { TOGETHER_API_KEY: 'together-key' } as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing configuration for Together provider');
    });

    it('should return a model instance when both baseUrl and apiKey are configured', () => {
      const instance = provider.getModelInstance({
        model: 'test-model',
        serverEnv: {
          TOGETHER_API_BASE_URL: 'https://api.together.xyz/v1',
          TOGETHER_API_KEY: 'together-test-key',
        } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('test-model');
    });

    it('should resolve baseUrl and apiKey from providerSettings', () => {
      const instance = provider.getModelInstance({
        model: 'test-model',
        serverEnv: {} as any,
        apiKeys: { Together: 'together-api-key' },
        providerSettings: {
          Together: { baseUrl: 'https://custom.together.api/v1' } as any,
        },
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('test-model');
    });
  });
});