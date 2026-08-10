import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCohere } from '@ai-sdk/cohere';
import CohereProvider from '~/lib/modules/llm/providers/cohere';

// cspell:words cohere Cohere Command

// Mock the Cohere SDK so no real API client is created.
vi.mock('@ai-sdk/cohere', () => ({
  createCohere: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'cohere' }))),
}));

describe('CohereProvider', () => {
  let provider: CohereProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CohereProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('Cohere');
      expect(provider.getApiKeyLink).toBe('https://dashboard.cohere.com/api-keys');
    });

    it('should use COHERE_API_KEY as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('COHERE_API_KEY');
    });

    it('should include Command R+ and Command R as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('command-r-plus-08-2024');
      expect(ids).toContain('command-r-08-2024');
      expect(ids).toContain('command-r-plus');
      expect(ids).toContain('command-r');
      expect(ids).toContain('command');
    });

    it('should set 4096 max token and 4000 completion tokens for all static models', () => {
      for (const model of provider.staticModels) {
        expect(model.maxTokenAllowed).toBe(4096);
        expect(model.maxCompletionTokens).toBe(4000);
        expect(model.provider).toBe('Cohere');
      }
    });

    it('should include Aya Expanse models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('c4ai-aya-expanse-8b');
      expect(ids).toContain('c4ai-aya-expanse-32b');
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
          model: 'command-r-plus',
          serverEnv: {} as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing API key for Cohere provider');
    });

    it('should return a model instance for the requested model', () => {
      const instance = provider.getModelInstance({
        model: 'command-r-plus',
        serverEnv: {} as any,
        apiKeys: { Cohere: 'cohere-test-key' },
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('command-r-plus');
    });

    it('should pass the API key to createCohere', () => {
      provider.getModelInstance({
        model: 'command-r',
        serverEnv: {} as any,
        apiKeys: { Cohere: 'cohere-my-key' },
        providerSettings: {},
      });

      expect(vi.mocked(createCohere)).toHaveBeenCalledWith({ apiKey: 'cohere-my-key' });
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      provider.getModelInstance({
        model: 'command',
        serverEnv: { COHERE_API_KEY: 'cohere-env-key' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(vi.mocked(createCohere)).toHaveBeenCalledWith({ apiKey: 'cohere-env-key' });
    });

    it('should resolve the API key from apiKeys using the provider name', () => {
      provider.getModelInstance({
        model: 'command-r-plus-08-2024',
        serverEnv: {} as any,
        apiKeys: { Cohere: 'cohere-from-apikeys' },
        providerSettings: {},
      });

      expect(vi.mocked(createCohere)).toHaveBeenCalledWith({ apiKey: 'cohere-from-apikeys' });
    });
  });
});