import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import MoonshotProvider from '~/lib/modules/llm/providers/moonshot';

// cspell:words moonshot Moonshot Kimi

// Mock the OpenAI SDK (Moonshot uses the OpenAI-compatible API with a different baseURL).
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'moonshot' }))),
}));

// Mock fetch globally so no real network calls are made.
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('MoonshotProvider', () => {
  let provider: MoonshotProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new MoonshotProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('Moonshot');
      expect(provider.getApiKeyLink).toBe('https://platform.moonshot.ai/console/api-keys');
    });

    it('should use MOONSHOT_API_KEY as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('MOONSHOT_API_KEY');
    });

    it('should include Moonshot v1 models with various context windows', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('moonshot-v1-8k');
      expect(ids).toContain('moonshot-v1-32k');
      expect(ids).toContain('moonshot-v1-128k');
      expect(ids).toContain('moonshot-v1-auto');
    });

    it('should set 8k context for moonshot-v1-8k', () => {
      const model = provider.staticModels.find((m) => m.name === 'moonshot-v1-8k');
      expect(model?.maxTokenAllowed).toBe(8000);
    });

    it('should set 32k context for moonshot-v1-32k', () => {
      const model = provider.staticModels.find((m) => m.name === 'moonshot-v1-32k');
      expect(model?.maxTokenAllowed).toBe(32000);
    });

    it('should set 128k context for moonshot-v1-128k', () => {
      const model = provider.staticModels.find((m) => m.name === 'moonshot-v1-128k');
      expect(model?.maxTokenAllowed).toBe(128000);
    });

    it('should include Kimi models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('kimi-latest');
      expect(ids).toContain('kimi-k2-0711-preview');
      expect(ids).toContain('kimi-k2-turbo-preview');
      expect(ids).toContain('kimi-thinking-preview');
    });

    it('should set 128k context for all Kimi models', () => {
      const kimiModels = provider.staticModels.filter((m) => m.name.startsWith('kimi'));
      for (const model of kimiModels) {
        expect(model.maxTokenAllowed).toBe(128000);
      }
    });

    it('should set provider to Moonshot for all static models', () => {
      for (const model of provider.staticModels) {
        expect(model.provider).toBe('Moonshot');
      }
    });
  });

  describe('getDynamicModels', () => {
    const apiKeys = { Moonshot: 'moonshot-test-key' };

    it('should return an empty list when no API key is configured (graceful failure)', async () => {
      const models = await provider.getDynamicModels({}, undefined, {});
      expect(models).toEqual([]);
    });

    it('should fetch models from the Moonshot API with Authorization header and timeout', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await provider.getDynamicModels(apiKeys, undefined, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.moonshot.ai/v1/models',
        expect.objectContaining({
          headers: { Authorization: 'Bearer moonshot-test-key' },
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
            { id: 'kimi-latest' },
            { id: 'kimi-new-model' },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('kimi-new-model');
    });

    it('should map dynamic models with "(Dynamic)" label and 128k context', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'kimi-v2-preview' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].label).toBe('kimi-v2-preview (Dynamic)');
      expect(models[0].maxTokenAllowed).toBe(128000);
      expect(models[0].provider).toBe('Moonshot');
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
          model: 'kimi-latest',
          serverEnv: {} as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing API key for Moonshot provider');
    });

    it('should return a model instance for the requested model', () => {
      const instance = provider.getModelInstance({
        model: 'kimi-latest',
        serverEnv: {} as any,
        apiKeys: { Moonshot: 'moonshot-test-key' },
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('kimi-latest');
    });

    it('should pass the correct baseURL and API key to createOpenAI', () => {
      provider.getModelInstance({
        model: 'kimi-k2-0711-preview',
        serverEnv: {} as any,
        apiKeys: { Moonshot: 'moonshot-my-key' },
        providerSettings: {},
      });

      expect(createOpenAI).toHaveBeenCalledWith({
        baseURL: 'https://api.moonshot.ai/v1',
        apiKey: 'moonshot-my-key',
      });
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      provider.getModelInstance({
        model: 'kimi-latest',
        serverEnv: { MOONSHOT_API_KEY: 'moonshot-env-key' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(createOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'moonshot-env-key' }),
      );
    });
  });
});