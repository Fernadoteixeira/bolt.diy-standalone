import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import CopilotProvider from '~/lib/modules/llm/providers/copilot';

// cspell:words copilot Copilot

// Mock the OpenAI SDK (Copilot uses the OpenAI-compatible API with a custom baseURL and fetch).
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'copilot' }))),
}));

// Mock the logger so no real console output is produced.
vi.mock('~/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock fetch globally so no real network calls are made.
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('CopilotProvider', () => {
  let provider: CopilotProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CopilotProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('Copilot');
      expect(provider.getApiKeyLink).toBe('https://github.com/settings/copilot');
    });

    it('should use GITHUB_API_KEY as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('GITHUB_API_KEY');
    });

    it('should have no static models (all models are dynamic)', () => {
      expect(provider.staticModels).toEqual([]);
    });

    it('should expose a label for getting API key', () => {
      expect(provider.labelForGetApiKey).toBe('Get GitHub Copilot access');
    });
  });

  describe('getDynamicModels', () => {
    const apiKeys = { Copilot: 'copilot-test-key' };

    it('should return an empty list when no API key is configured', async () => {
      const models = await provider.getDynamicModels({}, undefined, {});
      expect(models).toEqual([]);
    });

    it('should fetch models from the Copilot API with Authorization header and timeout signal', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await provider.getDynamicModels(apiKeys, undefined, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.githubcopilot.com/models',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer copilot-test-key',
            'Content-Type': 'application/json',
          },
        }),
      );
      const callArgs = mockFetch.mock.calls[0][1] as any;
      expect(callArgs.signal).toBeDefined();
    });

    it('should map models with id, name label, provider, and default context', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'gpt-4o', name: 'GPT-4o' },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('gpt-4o');
      expect(models[0].label).toBe('GPT-4o');
      expect(models[0].provider).toBe('Copilot');
      expect(models[0].maxTokenAllowed).toBe(128000);
      expect(models[0].maxCompletionTokens).toBe(16384);
    });

    it('should use model id as label when name is not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'some-model' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});
      expect(models[0].label).toBe('some-model');
    });

    it('should filter out embeddings capability models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'chat-model', capabilities: { type: 'chat' } },
            { id: 'embed-model', capabilities: { type: 'embeddings' } },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('chat-model');
    });

    it('should include models with no capability type', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'no-cap-model' }],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('no-cap-model');
    });

    it('should use limits from API response when available', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'limited-model',
              name: 'Limited Model',
              capabilities: {
                limits: { max_prompt_tokens: 64000, max_output_tokens: 8192 },
              },
            },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(64000);
      expect(models[0].maxCompletionTokens).toBe(8192);
    });

    it('should return an empty list when the API responds with an HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});
      expect(models).toEqual([]);
    });

    it('should return an empty list when the fetch fails (network error)', async () => {
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      const models = await provider.getDynamicModels(apiKeys, undefined, {});
      expect(models).toEqual([]);
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
      ).toThrow('Missing API key for Copilot provider');
    });

    it('should return a model instance for the requested model', () => {
      const instance = provider.getModelInstance({
        model: 'gpt-4o',
        serverEnv: {} as any,
        apiKeys: { Copilot: 'copilot-test-key' },
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('gpt-4o');
    });

    it('should pass the correct baseURL and API key to createOpenAI', () => {
      provider.getModelInstance({
        model: 'gpt-4o',
        serverEnv: {} as any,
        apiKeys: { Copilot: 'copilot-my-key' },
        providerSettings: {},
      });

      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.githubcopilot.com',
          apiKey: 'copilot-my-key',
        }),
      );
    });

    it('should pass a custom fetch function to createOpenAI', () => {
      provider.getModelInstance({
        model: 'gpt-4o',
        serverEnv: {} as any,
        apiKeys: { Copilot: 'copilot-my-key' },
        providerSettings: {},
      });

      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith(
        expect.objectContaining({
          fetch: expect.any(Function),
        }),
      );
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      provider.getModelInstance({
        model: 'gpt-4o',
        serverEnv: { GITHUB_API_KEY: 'copilot-env-key' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'copilot-env-key' }),
      );
    });
  });
});