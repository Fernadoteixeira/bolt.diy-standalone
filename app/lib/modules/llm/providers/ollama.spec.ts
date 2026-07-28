import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OllamaProvider from '~/lib/modules/llm/providers/ollama';

// cspell:words Ollama ollama OLLAMA gguf

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
  });

  it('should expose glm-5.2:cloud as a static model', () => {
    const glm = provider.staticModels.find((m) => m.name === 'glm-5.2:cloud');
    expect(glm).toBeDefined();
    expect(glm?.provider).toBe('Ollama');
    expect(glm?.maxTokenAllowed).toBe(1_000_000);
    expect(glm?.label).toContain('thinking');
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

    it('should list glm-5.2:cloud when Ollama returns it', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            {
              name: 'glm-5.2:cloud',
              model: 'glm-5.2:cloud',
              modified_at: '2026-07-28T00:00:00Z',
              size: 0,
              digest: 'glm-digest',
              details: {
                parent_model: '',
                format: 'cloud',
                family: 'glm5.2',
                families: ['glm5.2'],
                parameter_size: '756B',
                quantization_level: '',
              },
            },
          ],
        }),
      });

      const models = await provider.getDynamicModels(apiKeys, settings, serverEnv);

      expect(models).toEqual([
        {
          name: 'glm-5.2:cloud',
          label: 'glm-5.2:cloud (756B)',
          provider: 'Ollama',
          maxTokenAllowed: 8000,
        },
      ]);
    });

    it('should fetch and parse local models from a running Ollama instance', async () => {
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
      const warnSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      mockFetch.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'));

      const models = await provider.getDynamicModels(apiKeys, settings, serverEnv);

      expect(models).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('timed out'));
    });

    it('should return an empty list and warn when Ollama is not reachable', async () => {
      const warnSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
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
    it('should build a model instance for glm-5.2:cloud', () => {
      const instance = provider.getModelInstance({
        model: 'glm-5.2:cloud',
        apiKeys: {},
        providerSettings: { Ollama: { baseUrl: 'http://127.0.0.1:11434' } as any },
        serverEnv: { OLLAMA_API_BASE_URL: 'http://127.0.0.1:11434' } as any,
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('glm-5.2:cloud');
    });

    it('should build a model instance for llama3.2:1b', () => {
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
