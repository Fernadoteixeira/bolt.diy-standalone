import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import OpenAIProvider from '~/lib/modules/llm/providers/openai';

// cspell:words openai OpenAI GPT

// Mock the OpenAI SDK so no real API client is created.
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'openai' }))),
}));

// Mock fetch globally so no real network calls are made.
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAIProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('OpenAI');
      expect(provider.getApiKeyLink).toBe('https://platform.openai.com/api-keys');
    });

    it('should use OPENAI_API_KEY as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('OPENAI_API_KEY');
    });

    it('should include GPT-4o, GPT-4o Mini, GPT-3.5 Turbo, o1-preview, and o1-mini as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('gpt-4o');
      expect(ids).toContain('gpt-4o-mini');
      expect(ids).toContain('gpt-3.5-turbo');
      expect(ids).toContain('o1-preview');
      expect(ids).toContain('o1-mini');
    });

    it('should set 128k context for GPT-4o and GPT-4o Mini', () => {
      const gpt4o = provider.staticModels.find((m) => m.name === 'gpt-4o');
      const gpt4oMini = provider.staticModels.find((m) => m.name === 'gpt-4o-mini');
      expect(gpt4o?.maxTokenAllowed).toBe(128000);
      expect(gpt4oMini?.maxTokenAllowed).toBe(128000);
    });

    it('should set 16k context for GPT-3.5 Turbo', () => {
      const gpt35 = provider.staticModels.find((m) => m.name === 'gpt-3.5-turbo');
      expect(gpt35?.maxTokenAllowed).toBe(16000);
    });

    it('should set 65000 completion tokens for o1-mini', () => {
      const o1Mini = provider.staticModels.find((m) => m.name === 'o1-mini');
      expect(o1Mini?.maxCompletionTokens).toBe(65000);
    });
  });

  describe('getDynamicModels', () => {
    const apiKeys = { OpenAI: 'sk-test-key' };

    it('should throw when no API key is configured', async () => {
      await expect(provider.getDynamicModels({}, undefined, {})).rejects.toThrow();
    });

    it('should fetch models from the OpenAI API with Authorization header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await provider.getDynamicModels(apiKeys, undefined, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          headers: { Authorization: 'Bearer sk-test-key' },
        }),
      );
    });

    it('should only include models with object type "model" that start with gpt-, o, or chatgpt-', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'gpt-new-model', object: 'model' },
            { id: 'o3-new', object: 'model' },
            { id: 'chatgpt-new', object: 'model' },
            { id: 'davinci-002', object: 'model' },
            { id: 'text-embedding-3', object: 'embedding' },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      const ids = models.map((m) => m.name);
      expect(ids).toContain('gpt-new-model');
      expect(ids).toContain('o3-new');
      expect(ids).toContain('chatgpt-new');
      expect(ids).not.toContain('davinci-002');
      expect(ids).not.toContain('text-embedding-3');
    });

    it('should filter out models already in staticModels', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'gpt-4o', object: 'model' },
            { id: 'gpt-4o-new', object: 'model' },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('gpt-4o-new');
    });

    it('should use context_length from the API response when available', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'gpt-custom', object: 'model', context_length: 64000 }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(64000);
      expect(models[0].label).toContain('64k context');
    });

    it('should infer 128k context for gpt-4o models without context_length', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'gpt-4o-new-variant', object: 'model' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(128000);
    });

    it('should infer 8192 context for gpt-4 models (not turbo/1106)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'gpt-4-old', object: 'model' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(8192);
    });

    it('should infer 16385 context for gpt-3.5-turbo models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'gpt-3.5-turbo-new', object: 'model' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(16385);
    });

    it('should cap maxTokenAllowed at 128000', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'gpt-huge', object: 'model', context_length: 500000 }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(128000);
    });

    it('should set 100000 completion tokens for o3/o4 models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'o3-new', object: 'model' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxCompletionTokens).toBe(100000);
    });

    it('should set 32000 completion tokens for o1 (non-mini, non-preview) models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'o1-new', object: 'model' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxCompletionTokens).toBe(32000);
    });

    it('should set 4096 completion tokens for gpt-4o models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'gpt-4o-variant', object: 'model' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxCompletionTokens).toBe(4096);
    });

    it('should set 8192 completion tokens for gpt-4 (non-o) models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'gpt-4-legacy', object: 'model' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxCompletionTokens).toBe(8192);
    });

    it('should set provider to OpenAI for all dynamic models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'gpt-test', object: 'model' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].provider).toBe('OpenAI');
    });
  });

  describe('getModelInstance', () => {
    it('should throw when no API key is configured', () => {
      expect(() =>
        provider.getModelInstance({
          model: 'gpt-4o',
          serverEnv: {} as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing API key for OpenAI provider');
    });

    it('should return a model instance for the requested model', () => {
      const instance = provider.getModelInstance({
        model: 'gpt-4o',
        serverEnv: {} as any,
        apiKeys: { OpenAI: 'sk-test-key' },
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('gpt-4o');
    });

    it('should pass the API key to createOpenAI', () => {
      provider.getModelInstance({
        model: 'gpt-4o-mini',
        serverEnv: {} as any,
        apiKeys: { OpenAI: 'sk-my-key' },
        providerSettings: {},
      });

      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith({ apiKey: 'sk-my-key' });
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      const instance = provider.getModelInstance({
        model: 'gpt-4o',
        serverEnv: { OPENAI_API_KEY: 'sk-from-env' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith({ apiKey: 'sk-from-env' });
    });
  });
});