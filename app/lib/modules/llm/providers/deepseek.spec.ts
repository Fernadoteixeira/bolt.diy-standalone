import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDeepSeek } from '@ai-sdk/deepseek';
import DeepseekProvider from '~/lib/modules/llm/providers/deepseek';

// cspell:words deepseek DeepSeek

// Mock the DeepSeek SDK so no real API client is created.
vi.mock('@ai-sdk/deepseek', () => ({
  createDeepSeek: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'deepseek' }))),
}));

// Mock fetch globally so no real network calls are made.
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('DeepseekProvider', () => {
  let provider: DeepseekProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new DeepseekProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('Deepseek');
      expect(provider.getApiKeyLink).toBe('https://platform.deepseek.com/apiKeys');
    });

    it('should use DEEPSEEK_API_KEY as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('DEEPSEEK_API_KEY');
    });

    it('should include Deepseek-Coder, Deepseek-Chat, Deepseek-Reasoner, and DeepSeek V3.2 as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('deepseek-coder');
      expect(ids).toContain('deepseek-chat');
      expect(ids).toContain('deepseek-reasoner');
      expect(ids).toContain('deepseek-v3.2');
    });

    it('should set 64k context for V3.2 models', () => {
      const v32 = provider.staticModels.find((m) => m.name === 'deepseek-v3.2');
      expect(v32?.maxTokenAllowed).toBe(64000);
    });

    it('should set 8k context for coder, chat, and reasoner models', () => {
      const coder = provider.staticModels.find((m) => m.name === 'deepseek-coder');
      expect(coder?.maxTokenAllowed).toBe(8000);
    });
  });

  describe('getDynamicModels', () => {
    const apiKeys = { Deepseek: 'ds-test-key' };

    it('should return an empty list when no API key is configured (graceful failure)', async () => {
      const models = await provider.getDynamicModels({}, undefined, {});
      expect(models).toEqual([]);
    });

    it('should fetch models from the DeepSeek API with Authorization header and timeout signal', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await provider.getDynamicModels(apiKeys, undefined, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.deepseek.com/models',
        expect.objectContaining({
          headers: { Authorization: 'Bearer ds-test-key' },
        }),
      );
      // Verify a signal was passed (timeout)
      const callArgs = mockFetch.mock.calls[0][1] as any;
      expect(callArgs.signal).toBeDefined();
    });

    it('should filter out models already in staticModels', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'deepseek-chat' },
            { id: 'deepseek-new-model' },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('deepseek-new-model');
    });

    it('should map dynamic models with "(Dynamic)" label, 64k context, and 8192 completion tokens', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'deepseek-v4-preview' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].label).toBe('deepseek-v4-preview (Dynamic)');
      expect(models[0].maxTokenAllowed).toBe(64000);
      expect(models[0].maxCompletionTokens).toBe(8192);
      expect(models[0].provider).toBe('Deepseek');
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
          model: 'deepseek-chat',
          serverEnv: {} as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing API key for Deepseek provider');
    });

    it('should return a model instance for the requested model', () => {
      const instance = provider.getModelInstance({
        model: 'deepseek-chat',
        serverEnv: {} as any,
        apiKeys: { Deepseek: 'ds-test-key' },
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('deepseek-chat');
    });

    it('should pass the API key to createDeepSeek', () => {
      provider.getModelInstance({
        model: 'deepseek-reasoner',
        serverEnv: {} as any,
        apiKeys: { Deepseek: 'ds-my-key' },
        providerSettings: {},
      });

      expect(vi.mocked(createDeepSeek)).toHaveBeenCalledWith({ apiKey: 'ds-my-key' });
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      provider.getModelInstance({
        model: 'deepseek-chat',
        serverEnv: { DEEPSEEK_API_KEY: 'ds-env-key' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(vi.mocked(createDeepSeek)).toHaveBeenCalledWith({ apiKey: 'ds-env-key' });
    });
  });
});