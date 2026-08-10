import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import GithubProvider from '~/lib/modules/llm/providers/github';

// cspell:words github Github DeepSeek

// Mock the OpenAI SDK (GitHub Models uses the OpenAI-compatible API with a different baseURL).
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'github' }))),
}));

// Mock fetch globally so no real network calls are made.
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('GithubProvider', () => {
  let provider: GithubProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GithubProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('Github');
      expect(provider.getApiKeyLink).toBe('https://github.com/settings/personal-access-tokens');
    });

    it('should use GITHUB_API_KEY as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('GITHUB_API_KEY');
    });

    it('should include GPT-4o, o1-preview, and DeepSeek-R1 as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('openai/gpt-4o');
      expect(ids).toContain('openai/o1-preview');
      expect(ids).toContain('deepseek/deepseek-r1');
    });

    it('should set 131072 context for GPT-4o models', () => {
      const gpt4o = provider.staticModels.find((m) => m.name === 'openai/gpt-4o');
      const gpt4oMini = provider.staticModels.find((m) => m.name === 'openai/gpt-4o-mini');
      expect(gpt4o?.maxTokenAllowed).toBe(131072);
      expect(gpt4oMini?.maxTokenAllowed).toBe(131072);
    });

    it('should set 200000 context for o1', () => {
      const o1 = provider.staticModels.find((m) => m.name === 'openai/o1');
      expect(o1?.maxTokenAllowed).toBe(200000);
    });

    it('should set 1048576 context for GPT-4.1 models', () => {
      const gpt41 = provider.staticModels.find((m) => m.name === 'openai/gpt-4.1');
      expect(gpt41?.maxTokenAllowed).toBe(1048576);
    });

    it('should set all static model providers to Github', () => {
      for (const model of provider.staticModels) {
        expect(model.provider).toBe('Github');
      }
    });
  });

  describe('getDynamicModels', () => {
    const apiKeys = { Github: 'github-test-key' };

    it('should return static models when no API key is configured', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const models = await provider.getDynamicModels({}, undefined, {});
      expect(models).toEqual(provider.staticModels);
    });

    it('should fetch models from the GitHub Models API with Authorization header', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await provider.getDynamicModels(apiKeys, undefined, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'https://models.github.ai/v1/models',
        expect.objectContaining({
          headers: { Authorization: 'Bearer github-test-key' },
        }),
      );
    });

    it('should map dynamic models with id, label, and context from limits', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'openai/gpt-5',
              name: 'GPT-5',
              limits: { max_input_tokens: 256000, max_output_tokens: 16384 },
            },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('openai/gpt-5');
      expect(models[0].label).toBe('GPT-5');
      expect(models[0].provider).toBe('Github');
      expect(models[0].maxTokenAllowed).toBe(256000);
      expect(models[0].maxCompletionTokens).toBe(16384);
    });

    it('should default context to 128000 when limits are not provided', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'test/model', name: 'Test Model' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(128000);
      expect(models[0].maxCompletionTokens).toBe(16384);
    });

    it('should use the last segment of id as fallback label when name is not provided', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'publisher/model-name' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].label).toBe('model-name');
    });

    it('should return static models when the API responds with an HTTP error', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});
      expect(models).toEqual(provider.staticModels);
    });

    it('should return static models when the fetch fails (network error)', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      const models = await provider.getDynamicModels(apiKeys, undefined, {});
      expect(models).toEqual(provider.staticModels);
    });
  });

  describe('getModelInstance', () => {
    it('should throw when no API key is configured', () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(() =>
        provider.getModelInstance({
          model: 'openai/gpt-4o',
          serverEnv: {} as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing API key for Github provider');
    });

    it('should return a model instance for the requested model', () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const instance = provider.getModelInstance({
        model: 'openai/gpt-4o',
        serverEnv: {} as any,
        apiKeys: { Github: 'github-test-key' },
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('openai/gpt-4o');
    });

    it('should pass the correct baseURL and API key to createOpenAI', () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      provider.getModelInstance({
        model: 'openai/gpt-4o',
        serverEnv: {} as any,
        apiKeys: { Github: 'github-my-key' },
        providerSettings: {},
      });

      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith({
        baseURL: 'https://models.github.ai/inference',
        apiKey: 'github-my-key',
      });
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      provider.getModelInstance({
        model: 'openai/gpt-4o',
        serverEnv: { GITHUB_API_KEY: 'github-env-key' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'github-env-key' }),
      );
    });
  });
});