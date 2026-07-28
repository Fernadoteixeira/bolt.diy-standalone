import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OllamaProvider from '~/lib/modules/llm/providers/ollama';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the ollama-ai-provider SDK so we don't need a real network client
vi.mock('ollama-ai-provider', () => ({
  createOllama: vi.fn(() => {
    const factory = vi.fn((model: string) => ({ modelId: model, provider: 'ollama' }));
    return factory;
  }),
}));

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OllamaProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have the expected static configuration', () => {
    expect(provider.name).toBe('Ollama');
    expect(provider.config.baseUrlKey).toBe('OLLAMA_API_BASE_URL');
    expect(provider.staticModels).toEqual([]);
  });

  describe('getDefaultNumCtx', () => {
    it('should default to 32768 when DEFAULT_NUM_CTX is not set', () => {
      expect(provider.getDefaultNumCtx({} as any)).toBe(32768);
    });

    it('should use DEFAULT_NUM_CTX from serverEnv when provided', () => {
      expect(provider.getDefaultNumCtx({ DEFAULT_NUM_CTX: '8192' } as any)).toBe(8192);
    });
  });

  describe('getDynamicModels', () => {
    const apiKeys = {};
    const settings = { baseUrl: 'http://127.0.0.1:11434' } as any;
    const serverEnv = { OLLAMA_API_BASE_URL: 'http://127.0.0.1:11434' };

    it('should fetch and parse models from a running Ollama instance', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            {
              name: 'llama3.2:1b',
              model: 'llama3.2:1b',
              modified_at: '2024-01-01T00:00:00Z',
              size: 1234,
              digest: 'abc',
              details: {
                parent_model: '',
                format: 'gguf',
                family: 'llama',
                families: ['llama'],
                parameter_size: '1B',
                quantization_level: 'Q4_0',
              },
            },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, settings, serverEnv);

      expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:11434/api/tags', expect.any(Object));
      expect(models).toEqual([
        {
          name: 'llama3.2:1b',
          label: 'llama3.2:1b (1B)',
          provider: 'Ollama',
          maxTokenAllowed: 8000,
        },
      ]);
    });

    it('should return an empty list when Ollama responds with an HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const models = await provider.getDynamicModels(apiKeys, settings, serverEnv);

      expect(models).toEqual([]);
    });

    it('should return an empty list and warn when the request times out', async () => {
      const warnSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockFetch.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'));

      const models = await provider.getDynamicModels(apiKeys, settings, serverEnv);

      expect(models).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('timed out'));
    });

    it('should return an empty list and warn when Ollama is not reachable', async () => {
      const warnSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      const models = await provider.getDynamicModels(apiKeys, settings, serverEnv);

      expect(models).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('not reachable'));
    });

    it('should throw when no base URL is configured for the provider', async () => {
      await expect(provider.getDynamicModels({}, { baseUrl: '' } as any, {})).rejects.toThrow(
        'No baseUrl found for Ollama provider',
      );
    });
  });

  describe('getModelInstance', () => {
    it('should build a model instance using the resolved base URL', () => {
      const instance = provider.getModelInstance({
        model: 'llama3.2:1b',
        apiKeys: {},
        providerSettings: { Ollama: { baseUrl: 'http://127.0.0.1:11434' } as any },
        serverEnv: { OLLAMA_API_BASE_URL: 'http://127.0.0.1:11434' } as any,
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('llama3.2:1b');
    });
  });
});
