import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import ZaiProvider from '~/lib/modules/llm/providers/z-ai';

// cspell:words zai Zai GLM

// Mock the OpenAI SDK (Z.ai uses the OpenAI-compatible API with a custom baseURL and JWT auth).
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'z-ai' }))),
}));

// Mock fetch globally so no real network calls are made.
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('ZaiProvider', () => {
  let provider: ZaiProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ZaiProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('Z.ai');
      expect(provider.getApiKeyLink).toBe('https://open.bigmodel.cn/usercenter/apikeys');
    });

    it('should use ZAI_API_KEY as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('ZAI_API_KEY');
    });

    it('should set ZAI_BASE_URL as the base URL key', () => {
      expect(provider.config.baseUrlKey).toBe('ZAI_BASE_URL');
    });

    it('should include GLM-4.6, GLM-4.5, and GLM-4.5-flash as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('glm-4.6');
      expect(ids).toContain('glm-4.5');
      expect(ids).toContain('glm-4.5-flash');
    });

    it('should set 200k context for GLM-4.6', () => {
      const glm46 = provider.staticModels.find((m) => m.name === 'glm-4.6');
      expect(glm46?.maxTokenAllowed).toBe(200000);
      expect(glm46?.maxCompletionTokens).toBe(65536);
    });

    it('should set 128k context for GLM-4.5 and GLM-4.5-flash', () => {
      const glm45 = provider.staticModels.find((m) => m.name === 'glm-4.5');
      const glm45Flash = provider.staticModels.find((m) => m.name === 'glm-4.5-flash');
      expect(glm45?.maxTokenAllowed).toBe(128000);
      expect(glm45Flash?.maxTokenAllowed).toBe(128000);
    });

    it('should set all static model providers to Z.ai', () => {
      for (const model of provider.staticModels) {
        expect(model.provider).toBe('Z.ai');
      }
    });
  });

  describe('getDynamicModels', () => {
    // API key must be in format "id.secret" for JWT token generation
    const apiKeys = { 'Z.ai': '123456.testsecret' };

    it('should throw when no API key is configured', async () => {
      await expect(provider.getDynamicModels({}, undefined, {})).rejects.toThrow();
    });

    it('should throw when the API key format is invalid (missing secret)', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await expect(provider.getDynamicModels({ 'Z.ai': 'invalidkey' }, undefined, {})).rejects.toThrow();
    });

    it('should fetch models from the Z.ai API with Bearer token', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await provider.getDynamicModels(apiKeys, undefined, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.z.ai/api/coding/paas/v4/models',
        expect.objectContaining({
          headers: {
            Authorization: expect.stringContaining('Bearer '),
            'Content-Type': 'application/json',
          },
        }),
      );
    });

    it('should filter out static models and non-glm models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'glm-4.6', object: 'model' },
            { id: 'glm-new-model', object: 'model' },
            { id: 'non-glm-model', object: 'model' },
            { id: 'glm-embed', object: 'embedding' },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('glm-new-model');
    });

    it('should set 200k context for GLM-4.6 dynamic models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'glm-4.6-preview', object: 'model' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(200000);
      expect(models[0].maxCompletionTokens).toBe(65536);
    });

    it('should set 128k context for GLM-4.5 dynamic models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'glm-4.5-new', object: 'model' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(128000);
    });

    it('should set 128k context and 8192 completion for GLM-4 (non-4.5/4.6) models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'glm-4-base', object: 'model' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(128000);
      expect(models[0].maxCompletionTokens).toBe(8192);
    });

    it('should set 32k context and 4096 completion for GLM-3 models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'glm-3-old', object: 'model' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(32000);
      expect(models[0].maxCompletionTokens).toBe(4096);
    });

    it('should label dynamic models with context size', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'glm-4.6-new', object: 'model' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].label).toContain('200k context');
    });

    it('should set provider to Z.ai for all dynamic models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'glm-new', object: 'model' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].provider).toBe('Z.ai');
    });

    it('should return an empty list when the API responds with an HTTP error', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});
      expect(models).toEqual([]);
    });
  });

  describe('getModelInstance', () => {
    const apiKeys = { 'Z.ai': '123456.testsecret' };

    it('should throw when no API key is configured', () => {
      expect(() =>
        provider.getModelInstance({
          model: 'glm-4.6',
          serverEnv: {} as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing API key for Z.ai provider');
    });

    it('should return a model instance for the requested model', () => {
      const instance = provider.getModelInstance({
        model: 'glm-4.6',
        serverEnv: {} as any,
        apiKeys,
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('glm-4.6');
    });

    it('should pass a JWT token as apiKey to createOpenAI (not the raw API key)', () => {
      provider.getModelInstance({
        model: 'glm-4.5',
        serverEnv: {} as any,
        apiKeys,
        providerSettings: {},
      });

      const callArgs = vi.mocked(createOpenAI).mock.calls[0][0] as any;
      expect(callArgs.apiKey).not.toBe('123456.testsecret');
      expect(callArgs.apiKey.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should pass the correct baseURL to createOpenAI', () => {
      provider.getModelInstance({
        model: 'glm-4.6',
        serverEnv: {} as any,
        apiKeys,
        providerSettings: {},
      });

      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.z.ai/api/coding/paas/v4',
        }),
      );
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      provider.getModelInstance({
        model: 'glm-4.6',
        serverEnv: { ZAI_API_KEY: '123456.testsecret' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      const callArgs = vi.mocked(createOpenAI).mock.calls[0][0] as any;
      expect(callArgs.apiKey.split('.')).toHaveLength(3);
    });
  });
});