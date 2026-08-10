import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import PerplexityProvider from '~/lib/modules/llm/providers/perplexity';

// cspell:words perplexity Perplexity Sonar

// Mock the OpenAI SDK (Perplexity uses the OpenAI-compatible API with a different baseURL).
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'perplexity' }))),
}));

describe('PerplexityProvider', () => {
  let provider: PerplexityProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new PerplexityProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('Perplexity');
      expect(provider.getApiKeyLink).toBe('https://www.perplexity.ai/settings/api');
    });

    it('should use PERPLEXITY_API_KEY as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('PERPLEXITY_API_KEY');
    });

    it('should include Sonar, Sonar Pro, and Sonar Reasoning Pro as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('sonar');
      expect(ids).toContain('sonar-pro');
      expect(ids).toContain('sonar-reasoning-pro');
    });

    it('should set 8192 max token for all static models', () => {
      for (const model of provider.staticModels) {
        expect(model.maxTokenAllowed).toBe(8192);
        expect(model.provider).toBe('Perplexity');
      }
    });

    it('should not set maxCompletionTokens for static models (uses provider defaults)', () => {
      for (const model of provider.staticModels) {
        expect(model.maxCompletionTokens).toBeUndefined();
      }
    });
  });

  describe('getDynamicModels', () => {
    it('should not have a getDynamicModels method (static-only provider)', () => {
      expect(provider.getDynamicModels).toBeUndefined();
    });
  });

  describe('getModelInstance', () => {
    it('should throw when no API key is configured', () => {
      expect(() =>
        provider.getModelInstance({
          model: 'sonar',
          serverEnv: {} as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing API key for Perplexity provider');
    });

    it('should return a model instance for the requested model', () => {
      const instance = provider.getModelInstance({
        model: 'sonar-pro',
        serverEnv: {} as any,
        apiKeys: { Perplexity: 'perplexity-test-key' },
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('sonar-pro');
    });

    it('should pass the correct baseURL and API key to createOpenAI', () => {
      provider.getModelInstance({
        model: 'sonar',
        serverEnv: {} as any,
        apiKeys: { Perplexity: 'perplexity-my-key' },
        providerSettings: {},
      });

      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith({
        baseURL: 'https://api.perplexity.ai/',
        apiKey: 'perplexity-my-key',
      });
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      provider.getModelInstance({
        model: 'sonar-reasoning-pro',
        serverEnv: { PERPLEXITY_API_KEY: 'perplexity-env-key' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'perplexity-env-key' }),
      );
    });
  });
});