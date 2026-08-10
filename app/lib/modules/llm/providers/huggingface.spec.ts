import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import HuggingFaceProvider from '~/lib/modules/llm/providers/huggingface';

// cspell:words huggingface HuggingFace Qwen Llama CodeLlama Hermes Yi

// Mock the OpenAI SDK (HuggingFace uses the OpenAI-compatible API with a different baseURL).
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'huggingface' }))),
}));

describe('HuggingFaceProvider', () => {
  let provider: HuggingFaceProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new HuggingFaceProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('HuggingFace');
      expect(provider.getApiKeyLink).toBe('https://huggingface.co/settings/tokens');
    });

    it('should use HuggingFace_API_KEY as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('HuggingFace_API_KEY');
    });

    it('should include Qwen2.5-Coder, Yi-1.5-34B, and CodeLlama as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('Qwen/Qwen2.5-Coder-32B-Instruct');
      expect(ids).toContain('01-ai/Yi-1.5-34B-Chat');
      expect(ids).toContain('codellama/CodeLlama-34b-Instruct-hf');
    });

    it('should include Qwen2.5-72B and Llama-3.1-70B as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('Qwen/Qwen2.5-72B-Instruct');
      expect(ids).toContain('meta-llama/Llama-3.1-70B-Instruct');
    });

    it('should include Llama-3.1-405B as a static model', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('meta-llama/Llama-3.1-405B');
    });

    it('should set 8000 context for all static models', () => {
      for (const model of provider.staticModels) {
        expect(model.maxTokenAllowed).toBe(8000);
      }
    });

    it('should set all static model providers to HuggingFace', () => {
      for (const model of provider.staticModels) {
        expect(model.provider).toBe('HuggingFace');
      }
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
      ).toThrow('Missing API key for HuggingFace provider');
    });

    it('should return a model instance for the requested model', () => {
      const instance = provider.getModelInstance({
        model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
        serverEnv: {} as any,
        apiKeys: { HuggingFace: 'hf-test-key' },
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('Qwen/Qwen2.5-Coder-32B-Instruct');
    });

    it('should pass the correct baseURL and API key to createOpenAI', () => {
      provider.getModelInstance({
        model: 'Qwen/Qwen2.5-72B-Instruct',
        serverEnv: {} as any,
        apiKeys: { HuggingFace: 'hf-my-key' },
        providerSettings: {},
      });

      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith({
        baseURL: 'https://api-inference.huggingface.co/v1/',
        apiKey: 'hf-my-key',
      });
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      provider.getModelInstance({
        model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
        serverEnv: { HuggingFace_API_KEY: 'hf-env-key' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'hf-env-key' }),
      );
    });
  });
});