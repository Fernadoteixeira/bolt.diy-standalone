import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import HyperbolicProvider from '~/lib/modules/llm/providers/hyperbolic';

// cspell:words hyperbolic Hyperbolic Qwen DeepSeek

// Mock the OpenAI SDK (Hyperbolic uses the OpenAI-compatible API with a different baseURL).
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'hyperbolic' }))),
}));

// Mock fetch globally so no real network calls are made.
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('HyperbolicProvider', () => {
  let provider: HyperbolicProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new HyperbolicProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('Hyperbolic');
      expect(provider.getApiKeyLink).toBe('https://app.hyperbolic.xyz/settings');
    });

    it('should use HYPERBOLIC_API_KEY as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('HYPERBOLIC_API_KEY');
    });

    it('should include Qwen2.5-Coder, Qwen2.5-72B, and DeepSeek-V2.5 as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('Qwen/Qwen2.5-Coder-32B-Instruct');
      expect(ids).toContain('Qwen/Qwen2.5-72B-Instruct');
      expect(ids).toContain('deepseek-ai/DeepSeek-V2.5');
    });

    it('should set 8192 context for all static models', () => {
      for (const model of provider.staticModels) {
        expect(model.maxTokenAllowed).toBe(8192);
      }
    });

    it('should set all static model providers to Hyperbolic', () => {
      for (const model of provider.staticModels) {
        expect(model.provider).toBe('Hyperbolic');
      }
    });
  });

  describe('getDynamicModels', () => {
    const apiKeys = { Hyperbolic: 'hyperbolic-test-key' };

    it('should throw when no API key is configured', async () => {
      await expect(provider.getDynamicModels({}, undefined, {})).rejects.toThrow();
    });

    it('should fetch models from the Hyperbolic API with Authorization header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await provider.getDynamicModels(apiKeys, undefined, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.hyperbolic.xyz/v1/models',
        expect.objectContaining({
          headers: { Authorization: 'Bearer hyperbolic-test-key' },
        }),
      );
    });

    it('should filter models by object type "model" and supports_chat flag', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'chat-model', object: 'model', supports_chat: true, context_length: 32000 },
            { id: 'non-chat-model', object: 'model', supports_chat: false, context_length: 32000 },
            { id: 'embedding-model', object: 'embedding', supports_chat: true, context_length: 32000 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('chat-model');
    });

    it('should format label with context length in k', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'test-model', object: 'model', supports_chat: true, context_length: 32000 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].label).toContain('32k');
    });

    it('should use context_length as maxTokenAllowed', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'ctx-model', object: 'model', supports_chat: true, context_length: 64000 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(64000);
    });

    it('should default maxTokenAllowed to 8000 when context_length is not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'no-ctx-model', object: 'model', supports_chat: true }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(8000);
    });

    it('should set provider to Hyperbolic for all dynamic models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'model-a', object: 'model', supports_chat: true, context_length: 32000 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].provider).toBe('Hyperbolic');
    });
  });

  describe('getModelInstance', () => {
    it('should throw when no API key is configured', () => {
      expect(() =>
        provider.getModelInstance({
          model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
          serverEnv: {} as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow();
    });

    it('should return a model instance for the requested model', () => {
      const instance = provider.getModelInstance({
        model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
        serverEnv: {} as any,
        apiKeys: { Hyperbolic: 'hyperbolic-test-key' },
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('Qwen/Qwen2.5-Coder-32B-Instruct');
    });

    it('should pass the correct baseURL and API key to createOpenAI', () => {
      provider.getModelInstance({
        model: 'Qwen/Qwen2.5-72B-Instruct',
        serverEnv: {} as any,
        apiKeys: { Hyperbolic: 'hyperbolic-my-key' },
        providerSettings: {},
      });

      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith({
        baseURL: 'https://api.hyperbolic.xyz/v1/',
        apiKey: 'hyperbolic-my-key',
      });
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      provider.getModelInstance({
        model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
        serverEnv: { HYPERBOLIC_API_KEY: 'hyperbolic-env-key' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'hyperbolic-env-key' }),
      );
    });
  });
});