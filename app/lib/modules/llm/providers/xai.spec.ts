import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import XAIProvider from '~/lib/modules/llm/providers/xai';

// cspell:words xai xAI Grok

// Mock the OpenAI SDK (xAI uses the OpenAI-compatible API with a different baseURL).
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'xai' }))),
}));

describe('XAIProvider', () => {
  let provider: XAIProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new XAIProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('xAI');
      expect(provider.getApiKeyLink).toBe('https://docs.x.ai/docs/quickstart#creating-an-api-key');
    });

    it('should use XAI_API_KEY as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('XAI_API_KEY');
    });

    it('should include grok-4, grok-3-mini, and grok-code-fast-1 as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('grok-4');
      expect(ids).toContain('grok-4-07-09');
      expect(ids).toContain('grok-3-mini');
      expect(ids).toContain('grok-3-mini-fast');
      expect(ids).toContain('grok-code-fast-1');
    });

    it('should set 256k context for grok-4 models', () => {
      const grok4 = provider.staticModels.find((m) => m.name === 'grok-4');
      const grok40709 = provider.staticModels.find((m) => m.name === 'grok-4-07-09');
      expect(grok4?.maxTokenAllowed).toBe(256000);
      expect(grok40709?.maxTokenAllowed).toBe(256000);
    });

    it('should set 131k context for grok-3-mini models', () => {
      const grok3Mini = provider.staticModels.find((m) => m.name === 'grok-3-mini');
      const grok3MiniFast = provider.staticModels.find((m) => m.name === 'grok-3-mini-fast');
      expect(grok3Mini?.maxTokenAllowed).toBe(131000);
      expect(grok3MiniFast?.maxTokenAllowed).toBe(131000);
    });

    it('should set 131k context for grok-code-fast-1', () => {
      const model = provider.staticModels.find((m) => m.name === 'grok-code-fast-1');
      expect(model?.maxTokenAllowed).toBe(131000);
    });

    it('should set provider to xAI for all static models', () => {
      for (const model of provider.staticModels) {
        expect(model.provider).toBe('xAI');
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
          model: 'grok-4',
          serverEnv: {} as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing API key for xAI provider');
    });

    it('should return a model instance for the requested model', () => {
      const instance = provider.getModelInstance({
        model: 'grok-4',
        serverEnv: {} as any,
        apiKeys: { xAI: 'xai-test-key' },
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('grok-4');
    });

    it('should pass the correct baseURL and API key to createOpenAI', () => {
      provider.getModelInstance({
        model: 'grok-3-mini',
        serverEnv: {} as any,
        apiKeys: { xAI: 'xai-my-key' },
        providerSettings: {},
      });

      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith({
        baseURL: 'https://api.x.ai/v1',
        apiKey: 'xai-my-key',
      });
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      provider.getModelInstance({
        model: 'grok-4',
        serverEnv: { XAI_API_KEY: 'xai-env-key' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'xai-env-key' }),
      );
    });

    it('should resolve the API key from apiKeys using the provider name', () => {
      provider.getModelInstance({
        model: 'grok-code-fast-1',
        serverEnv: {} as any,
        apiKeys: { xAI: 'xai-from-apikeys' },
        providerSettings: {},
      });

      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'xai-from-apikeys' }),
      );
    });
  });
});