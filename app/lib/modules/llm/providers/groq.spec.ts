import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import GroqProvider from '~/lib/modules/llm/providers/groq';

// cspell:words groq Groq Llama

// Mock the OpenAI SDK (Groq uses the OpenAI-compatible API with a different baseURL).
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'groq' }))),
}));

// Mock fetch globally so no real network calls are made.
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('GroqProvider', () => {
  let provider: GroqProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GroqProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('Groq');
      expect(provider.getApiKeyLink).toBe('https://console.groq.com/keys');
    });

    it('should use GROQ_API_KEY as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('GROQ_API_KEY');
    });

    it('should include Llama 3.1 8B and Llama 3.3 70B as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('llama-3.1-8b-instant');
      expect(ids).toContain('llama-3.3-70b-versatile');
    });

    it('should set 128k context for all static models', () => {
      for (const model of provider.staticModels) {
        expect(model.maxTokenAllowed).toBe(128000);
        expect(model.maxCompletionTokens).toBe(8192);
        expect(model.provider).toBe('Groq');
      }
    });
  });

  describe('getDynamicModels', () => {
    const apiKeys = { Groq: 'groq-test-key' };

    it('should throw when no API key is configured', async () => {
      await expect(provider.getDynamicModels({}, undefined, {})).rejects.toThrow();
    });

    it('should fetch models from the Groq API with Authorization header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await provider.getDynamicModels(apiKeys, undefined, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/models',
        expect.objectContaining({
          headers: { Authorization: 'Bearer groq-test-key' },
        }),
      );
    });

    it('should only include active models with object type "model" and context_window > 8000', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'active-big', object: 'model', active: true, context_window: 32000, owned_by: 'Meta' },
            { id: 'active-small', object: 'model', active: true, context_window: 4000, owned_by: 'Meta' },
            { id: 'inactive-big', object: 'model', active: false, context_window: 32000, owned_by: 'Meta' },
            { id: 'wrong-type', object: 'embedding', active: true, context_window: 32000, owned_by: 'Meta' },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      const ids = models.map((m) => m.name);
      expect(ids).toContain('active-big');
      expect(ids).not.toContain('active-small');
      expect(ids).not.toContain('inactive-big');
      expect(ids).not.toContain('wrong-type');
    });

    it('should format label with context window size and owner', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'test-model', object: 'model', active: true, context_window: 32000, owned_by: 'Meta' },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].label).toContain('test-model');
      expect(models[0].label).toContain('32k');
      expect(models[0].label).toContain('Meta');
    });

    it('should cap maxTokenAllowed at 16384', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'huge-model', object: 'model', active: true, context_window: 128000, owned_by: 'Meta' },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(16384);
    });

    it('should use min(context_window, 16384) for maxTokenAllowed', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'small-ctx', object: 'model', active: true, context_window: 10000, owned_by: 'Groq' },
            { id: 'big-ctx', object: 'model', active: true, context_window: 128000, owned_by: 'Groq' },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      const small = models.find((m) => m.name === 'small-ctx');
      const big = models.find((m) => m.name === 'big-ctx');
      expect(small?.maxTokenAllowed).toBe(10000); // min(10000, 16384) = 10000
      expect(big?.maxTokenAllowed).toBe(16384); // min(128000, 16384) = 16384
    });

    it('should set maxCompletionTokens to 8192 for all dynamic models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'model-a', object: 'model', active: true, context_window: 32000, owned_by: 'Meta' },
            { id: 'model-b', object: 'model', active: true, context_window: 128000, owned_by: 'Groq' },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      for (const model of models) {
        expect(model.maxCompletionTokens).toBe(8192);
      }
    });

    it('should set provider to Groq for all dynamic models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'test', object: 'model', active: true, context_window: 32000, owned_by: 'Meta' },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].provider).toBe('Groq');
    });

    it('should filter out models with context_window <= 8000', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'valid-ctx', object: 'model', active: true, context_window: 32000, owned_by: 'Meta' },
            { id: 'low-ctx', object: 'model', active: true, context_window: 8000, owned_by: 'Meta' },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('valid-ctx');
    });
  });

  describe('getModelInstance', () => {
    it('should throw when no API key is configured', () => {
      expect(() =>
        provider.getModelInstance({
          model: 'llama-3.1-8b-instant',
          serverEnv: {} as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing API key for Groq provider');
    });

    it('should return a model instance for the requested model', () => {
      const instance = provider.getModelInstance({
        model: 'llama-3.1-8b-instant',
        serverEnv: {} as any,
        apiKeys: { Groq: 'groq-test-key' },
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('llama-3.1-8b-instant');
    });

    it('should pass the correct baseURL and API key to createOpenAI', () => {
      provider.getModelInstance({
        model: 'llama-3.3-70b-versatile',
        serverEnv: {} as any,
        apiKeys: { Groq: 'groq-my-key' },
        providerSettings: {},
      });

      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith({
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: 'groq-my-key',
      });
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      provider.getModelInstance({
        model: 'llama-3.1-8b-instant',
        serverEnv: { GROQ_API_KEY: 'groq-env-key' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'groq-env-key' }),
      );
    });
  });
});