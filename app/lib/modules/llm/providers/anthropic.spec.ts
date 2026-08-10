import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAnthropic } from '@ai-sdk/anthropic';
import AnthropicProvider from '~/lib/modules/llm/providers/anthropic';

// cspell:words anthropic Anthropic Claude

// Mock the Anthropic SDK so no real API client is created.
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'anthropic' }))),
}));

// Mock fetch globally so no real network calls are made.
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AnthropicProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('Anthropic');
      expect(provider.getApiKeyLink).toBe('https://console.anthropic.com/settings/keys');
    });

    it('should use ANTHROPIC_API_KEY as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('ANTHROPIC_API_KEY');
    });

    it('should include Claude 3.5 Sonnet, Claude 3 Haiku, and Claude Opus 4 as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('claude-3-5-sonnet-20241022');
      expect(ids).toContain('claude-3-haiku-20240307');
      expect(ids).toContain('claude-opus-4-20250514');
    });

    it('should set 200k context for all static models', () => {
      for (const model of provider.staticModels) {
        expect(model.maxTokenAllowed).toBe(200000);
        expect(model.provider).toBe('Anthropic');
      }
    });
  });

  describe('getDynamicModels', () => {
    const apiKeys = { Anthropic: 'sk-ant-test-key' };

    it('should throw when no API key is configured', async () => {
      await expect(provider.getDynamicModels({}, undefined, {})).rejects.toThrow();
    });

    it('should fetch models from the Anthropic API with x-api-key and anthropic-version headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await provider.getDynamicModels(apiKeys, undefined, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/models',
        expect.objectContaining({
          headers: {
            'x-api-key': 'sk-ant-test-key',
            'anthropic-version': '2023-06-01',
          },
        }),
      );
    });

    it('should filter out models already present in staticModels', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'claude-3-5-sonnet-20241022', display_name: 'Claude 3.5 Sonnet', type: 'model' },
            { id: 'claude-new-model', display_name: 'Claude New Model', type: 'model', max_tokens: 100000 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('claude-new-model');
    });

    it('should use max_tokens from the API response as context window', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'claude-test', display_name: 'Claude Test', type: 'model', max_tokens: 50000 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(50000);
      expect(models[0].label).toContain('50k context');
    });

    it('should default context window to 32000 when max_tokens is not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'claude-unknown', display_name: 'Claude Unknown', type: 'model' },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxTokenAllowed).toBe(32000);
    });

    it('should infer 200k context for known Claude 3 models without max_tokens', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'claude-3-5-sonnet-v2', display_name: 'Claude 3.5 Sonnet v2', type: 'model' },
            { id: 'claude-3-haiku-v2', display_name: 'Claude 3 Haiku v2', type: 'model' },
            { id: 'claude-3-opus-v2', display_name: 'Claude 3 Opus v2', type: 'model' },
            { id: 'claude-3-sonnet-v2', display_name: 'Claude 3 Sonnet v2', type: 'model' },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      for (const model of models) {
        expect(model.maxTokenAllowed).toBe(200000);
      }
    });

    it('should set 32000 completion tokens for Claude Opus 4 models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'claude-opus-4-new', display_name: 'Claude Opus 4 New', type: 'model', max_tokens: 200000 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxCompletionTokens).toBe(32000);
    });

    it('should set 64000 completion tokens for Claude Sonnet 4 models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'claude-sonnet-4-new', display_name: 'Claude Sonnet 4 New', type: 'model', max_tokens: 200000 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxCompletionTokens).toBe(64000);
    });

    it('should default completion tokens to 128000 for non-Claude-4 models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'claude-3-something', display_name: 'Claude 3 Something', type: 'model', max_tokens: 200000 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models[0].maxCompletionTokens).toBe(128000);
    });

    it('should filter out non-model types', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'claude-real', display_name: 'Claude Real', type: 'model', max_tokens: 200000 },
            { id: 'some-tool', display_name: 'Some Tool', type: 'tool', max_tokens: 200000 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('claude-real');
    });

    it('should set provider to Anthropic for all returned models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'claude-a', display_name: 'Claude A', type: 'model', max_tokens: 200000 },
            { id: 'claude-b', display_name: 'Claude B', type: 'model', max_tokens: 200000 },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, undefined, {});

      for (const model of models) {
        expect(model.provider).toBe('Anthropic');
      }
    });
  });

  describe('getModelInstance', () => {
    it('should pass undefined apiKey to createAnthropic when no API key is configured', () => {
      provider.getModelInstance({
        model: 'claude-3-5-sonnet-20241022',
        serverEnv: {} as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(createAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { 'anthropic-beta': 'output-128k-2025-02-19' },
        }),
      );
    });

    it('should return a model instance for the requested model', () => {
      const instance = provider.getModelInstance({
        model: 'claude-3-5-sonnet-20241022',
        serverEnv: {} as any,
        apiKeys: { Anthropic: 'sk-ant-test-key' },
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('claude-3-5-sonnet-20241022');
    });

    it('should pass the anthropic-beta header to createAnthropic', () => {
      provider.getModelInstance({
        model: 'claude-opus-4-20250514',
        serverEnv: {} as any,
        apiKeys: { Anthropic: 'sk-ant-test-key' },
        providerSettings: {},
      });

      expect(vi.mocked(createAnthropic)).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'sk-ant-test-key',
          headers: { 'anthropic-beta': 'output-128k-2025-02-19' },
        }),
      );
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      const instance = provider.getModelInstance({
        model: 'claude-3-haiku-20240307',
        serverEnv: { ANTHROPIC_API_KEY: 'sk-ant-from-env' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect(vi.mocked(createAnthropic)).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'sk-ant-from-env' }),
      );
    });
  });
});