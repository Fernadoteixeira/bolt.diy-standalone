import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import GoogleProvider from '~/lib/modules/llm/providers/google';

// cspell:words google Google Gemini

// Mock the Google AI SDK so no real API client is created.
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'google' }))),
}));

// Mock fetch globally so no real network calls are made.
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('GoogleProvider', () => {
  let provider: GoogleProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GoogleProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('Google');
      expect(provider.getApiKeyLink).toBe('https://aistudio.google.com/app/apikey');
    });

    it('should use GOOGLE_GENERATIVE_AI_API_KEY as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('GOOGLE_GENERATIVE_AI_API_KEY');
    });

    it('should include Gemini 1.5 Pro and Gemini 1.5 Flash as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('gemini-1.5-pro');
      expect(ids).toContain('gemini-1.5-flash');
    });

    it('should set 2M context for Gemini 1.5 Pro', () => {
      const pro = provider.staticModels.find((m) => m.name === 'gemini-1.5-pro');
      expect(pro?.maxTokenAllowed).toBe(2000000);
      expect(pro?.maxCompletionTokens).toBe(8192);
    });

    it('should set 1M context for Gemini 1.5 Flash', () => {
      const flash = provider.staticModels.find((m) => m.name === 'gemini-1.5-flash');
      expect(flash?.maxTokenAllowed).toBe(1000000);
    });
  });

  describe('getDynamicModels', () => {
    const apiKeys = { Google: 'google-test-key' };

    it('should throw when no API key is configured', async () => {
      await expect(provider.getDynamicModels({}, undefined, {})).rejects.toThrow();
    });

    it('should fetch models from the Google API with the API key as a query parameter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await provider.getDynamicModels(apiKeys, undefined, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models?key=google-test-key',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should throw an error when the API response is not ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(provider.getDynamicModels(apiKeys, undefined, {})).rejects.toThrow(
        'Failed to fetch models from Google API: 403 Forbidden',
      );
    });

    it('should throw an error when the response has no models array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: 'format' }),
      });

      await expect(provider.getDynamicModels(apiKeys, undefined, {})).rejects.toThrow(
        'Invalid response format from Google API',
      );
    });

    it('should filter out models with low output token limits (< 8000)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { name: 'models/good-model', displayName: 'Good Model', inputTokenLimit: 32000, outputTokenLimit: 8192 },
            { name: 'models/low-limit-model', displayName: 'Low Limit', inputTokenLimit: 32000, outputTokenLimit: 4000 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('good-model');
    });

    it('should filter out experimental models except flash-exp', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { name: 'models/stable-model', displayName: 'Stable', inputTokenLimit: 32000, outputTokenLimit: 8192 },
            { name: 'models/exp-model', displayName: 'Experimental', inputTokenLimit: 32000, outputTokenLimit: 8192 },
            { name: 'models/flash-exp-model', displayName: 'Flash Exp', inputTokenLimit: 32000, outputTokenLimit: 8192 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});
      const ids = models.map((m) => m.name);

      expect(ids).toContain('stable-model');
      expect(ids).not.toContain('exp-model');
      expect(ids).toContain('flash-exp-model');
    });

    it('should strip "models/" prefix from the model name', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { name: 'models/gemini-new', displayName: 'Gemini New', inputTokenLimit: 1000000, outputTokenLimit: 8192 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].name).toBe('gemini-new');
    });

    it('should use inputTokenLimit as the context window', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { name: 'models/big-model', displayName: 'Big Model', inputTokenLimit: 500000, outputTokenLimit: 8192 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(500000);
    });

    it('should cap the context window at 2M tokens', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { name: 'models/huge-model', displayName: 'Huge', inputTokenLimit: 5000000, outputTokenLimit: 8192 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(2000000);
    });

    it('should infer context windows from model name when token limits are not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { name: 'models/gemini-1.5-pro-no-limits', displayName: 'Gemini 1.5 Pro', outputTokenLimit: 8192 },
            { name: 'models/gemini-1.5-flash-no-limits', displayName: 'Gemini 1.5 Flash', outputTokenLimit: 8192 },
            { name: 'models/gemini-2.0-flash-no-limits', displayName: 'Gemini 2.0 Flash', outputTokenLimit: 8192 },
            { name: 'models/gemini-pro-no-limits', displayName: 'Gemini Pro', outputTokenLimit: 8192 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      const proModel = models.find((m) => m.name === 'gemini-1.5-pro-no-limits');
      const flashModel = models.find((m) => m.name === 'gemini-1.5-flash-no-limits');
      const flash2Model = models.find((m) => m.name === 'gemini-2.0-flash-no-limits');
      const geminiProModel = models.find((m) => m.name === 'gemini-pro-no-limits');

      expect(proModel?.maxTokenAllowed).toBe(2000000);
      expect(flashModel?.maxTokenAllowed).toBe(1000000);
      expect(flash2Model?.maxTokenAllowed).toBe(1000000);
      expect(geminiProModel?.maxTokenAllowed).toBe(32000);
    });

    it('should use outputTokenLimit as completion tokens, capped at 128000', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { name: 'models/model-a', displayName: 'Model A', inputTokenLimit: 32000, outputTokenLimit: 200000 },
            { name: 'models/model-b', displayName: 'Model B', inputTokenLimit: 32000, outputTokenLimit: 16384 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      const modelA = models.find((m) => m.name === 'model-a');
      const modelB = models.find((m) => m.name === 'model-b');

      expect(modelA?.maxCompletionTokens).toBe(128000);
      expect(modelB?.maxCompletionTokens).toBe(16384);
    });

    it('should filter out models with outputTokenLimit <= 8000', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { name: 'models/valid', displayName: 'Valid', inputTokenLimit: 32000, outputTokenLimit: 8192 },
            { name: 'models/low-limit', displayName: 'Low Limit', inputTokenLimit: 32000, outputTokenLimit: 8000 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('valid');
    });

    it('should format label with "M" for context >= 1M and "k" otherwise', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { name: 'models/big', displayName: 'Big', inputTokenLimit: 2000000, outputTokenLimit: 8192 },
            { name: 'models/small', displayName: 'Small', inputTokenLimit: 32000, outputTokenLimit: 8192 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      const big = models.find((m) => m.name === 'big');
      const small = models.find((m) => m.name === 'small');

      expect(big?.label).toContain('2M context');
      expect(small?.label).toContain('32k context');
    });

    it('should set provider to Google for all dynamic models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { name: 'models/test', displayName: 'Test', inputTokenLimit: 32000, outputTokenLimit: 8192 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].provider).toBe('Google');
    });
  });

  describe('getModelInstance', () => {
    it('should throw when no API key is configured', () => {
      expect(() =>
        provider.getModelInstance({
          model: 'gemini-1.5-pro',
          serverEnv: {} as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing API key for Google provider');
    });

    it('should return a model instance for the requested model', () => {
      const instance = provider.getModelInstance({
        model: 'gemini-1.5-pro',
        serverEnv: {} as any,
        apiKeys: { Google: 'google-test-key' },
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('gemini-1.5-pro');
    });

    it('should pass the API key to createGoogleGenerativeAI', () => {
      provider.getModelInstance({
        model: 'gemini-1.5-flash',
        serverEnv: {} as any,
        apiKeys: { Google: 'google-my-key' },
        providerSettings: {},
      });

      expect(vi.mocked(createGoogleGenerativeAI)).toHaveBeenCalledWith({ apiKey: 'google-my-key' });
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      provider.getModelInstance({
        model: 'gemini-1.5-pro',
        serverEnv: { GOOGLE_GENERATIVE_AI_API_KEY: 'google-env-key' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(vi.mocked(createGoogleGenerativeAI)).toHaveBeenCalledWith({ apiKey: 'google-env-key' });
    });
  });
});