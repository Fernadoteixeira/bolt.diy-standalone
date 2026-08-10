import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMistral } from '@ai-sdk/mistral';
import MistralProvider from '~/lib/modules/llm/providers/mistral';

// cspell:words mistral Mistral Codestral

// Mock the Mistral SDK so no real API client is created.
vi.mock('@ai-sdk/mistral', () => ({
  createMistral: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'mistral' }))),
}));

describe('MistralProvider', () => {
  let provider: MistralProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new MistralProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('Mistral');
      expect(provider.getApiKeyLink).toBe('https://console.mistral.ai/api-keys/');
    });

    it('should use MISTRAL_API_KEY as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('MISTRAL_API_KEY');
    });

    it('should include Mistral 7B, Mixtral 8x7B, Mixtral 8x22B, and Codestral as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('open-mistral-7b');
      expect(ids).toContain('open-mixtral-8x7b');
      expect(ids).toContain('open-mixtral-8x22b');
      expect(ids).toContain('codestral-latest');
      expect(ids).toContain('mistral-large-latest');
    });

    it('should set 8000 max token and 8192 completion tokens for all static models', () => {
      for (const model of provider.staticModels) {
        expect(model.maxTokenAllowed).toBe(8000);
        expect(model.maxCompletionTokens).toBe(8192);
        expect(model.provider).toBe('Mistral');
      }
    });

    it('should include ministral and mistral-small models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('ministral-8b-latest');
      expect(ids).toContain('mistral-small-latest');
    });

    it('should include Codestral Mamba and Mistral Nemo', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('open-codestral-mamba');
      expect(ids).toContain('open-mistral-nemo');
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
          model: 'mistral-large-latest',
          serverEnv: {} as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing API key for Mistral provider');
    });

    it('should return a model instance for the requested model', () => {
      const instance = provider.getModelInstance({
        model: 'codestral-latest',
        serverEnv: {} as any,
        apiKeys: { Mistral: 'mistral-test-key' },
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('codestral-latest');
    });

    it('should pass the API key to createMistral', () => {
      provider.getModelInstance({
        model: 'mistral-large-latest',
        serverEnv: {} as any,
        apiKeys: { Mistral: 'mistral-my-key' },
        providerSettings: {},
      });

      expect(vi.mocked(createMistral)).toHaveBeenCalledWith({ apiKey: 'mistral-my-key' });
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      provider.getModelInstance({
        model: 'open-mistral-7b',
        serverEnv: { MISTRAL_API_KEY: 'mistral-env-key' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(vi.mocked(createMistral)).toHaveBeenCalledWith({ apiKey: 'mistral-env-key' });
    });
  });
});