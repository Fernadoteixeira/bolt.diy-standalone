import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  discoverLocalProviders,
  checkProviderAvailability,
  getRecommendedProvider,
  parseOllamaModels,
  parseLMStudioModels,
} from '~/lib/services/local-provider-discovery';
import type { DiscoveredProvider, ModelInfo } from '~/lib/services/local-provider-discovery';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Local Provider Discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseOllamaModels', () => {
    it('should parse Ollama models response correctly', () => {
      const mockData = {
        models: [
          {
            name: 'gemma:7b',
            model: 'gemma:7b',
            modified_at: '2024-01-01T00:00:00Z',
            size: 4811016674,
            digest: 'abc123',
            details: {
              parent_model: '',
              format: 'gguf',
              family: 'gemma',
              families: ['gemma'],
              parameter_size: '7B',
              quantization_level: 'Q4_0',
            },
          },
          {
            name: 'llama3.2:3b',
            model: 'llama3.2:3b',
            modified_at: '2024-01-01T00:00:00Z',
            size: 2014567890,
            digest: 'def456',
            details: {
              parent_model: '',
              format: 'gguf',
              family: 'llama',
              families: ['llama'],
              parameter_size: '3B',
              quantization_level: 'Q4_K_M',
            },
          },
        ],
      };

      const result = parseOllamaModels(mockData);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'gemma:7b',
        label: 'gemma:7b (7B)',
        provider: 'Ollama',
        maxTokenAllowed: 8000,
      });
      expect(result[1]).toEqual({
        name: 'llama3.2:3b',
        label: 'llama3.2:3b (3B)',
        provider: 'Ollama',
        maxTokenAllowed: 8000,
      });
    });

    it('should handle empty models array', () => {
      const mockData = { models: [] };
      const result = parseOllamaModels(mockData);
      expect(result).toHaveLength(0);
    });

    it('should handle missing details gracefully', () => {
      const mockData = {
        models: [
          {
            name: 'unknown-model',
            details: {},
          },
        ],
      };

      const result = parseOllamaModels(mockData);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('unknown-model (unknown)');
    });

    it('should handle malformed data', () => {
      const mockData = {};
      const result = parseOllamaModels(mockData);
      expect(result).toHaveLength(0);
    });
  });

  describe('parseLMStudioModels', () => {
    it('should parse LMStudio models response correctly', () => {
      const mockData = {
        data: [
          {
            id: 'meta-llama/Llama-3.2-3B-Instruct',
            object: 'model',
            created: 1234567890,
            owned_by: 'system',
            context_length: 4096,
          },
          {
            id: 'TheBloke/CodeLlama-7B-Instruct-GGUF',
            object: 'model',
            created: 1234567891,
            owned_by: 'system',
            context_length: 8192,
          },
        ],
      };

      const result = parseLMStudioModels(mockData);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'meta-llama/Llama-3.2-3B-Instruct',
        label: 'meta-llama/Llama-3.2-3B-Instruct',
        provider: 'LMStudio',
        maxTokenAllowed: 4096,
      });
      expect(result[1]).toEqual({
        name: 'TheBloke/CodeLlama-7B-Instruct-GGUF',
        label: 'TheBloke/CodeLlama-7B-Instruct-GGUF',
        provider: 'LMStudio',
        maxTokenAllowed: 8192,
      });
    });

    it('should handle missing context_length', () => {
      const mockData = {
        data: [
          {
            id: 'model-without-context',
            object: 'model',
          },
        ],
      };

      const result = parseLMStudioModels(mockData);

      expect(result).toHaveLength(1);
      expect(result[0].maxTokenAllowed).toBe(4096); // default
    });

    it('should handle empty data array', () => {
      const mockData = { data: [] };
      const result = parseLMStudioModels(mockData);
      expect(result).toHaveLength(0);
    });
  });

  describe('discoverLocalProviders', () => {
    it('should discover Ollama provider when available', async () => {
      const mockOllamaResponse = {
        models: [
          {
            name: 'gemma:7b',
            details: { parameter_size: '7B' },
          },
        ],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockOllamaResponse,
        })
        .mockRejectedValueOnce(new Error('Connection refused')) // LMStudio
        .mockRejectedValueOnce(new Error('Connection refused')) // Jan
        .mockRejectedValueOnce(new Error('Connection refused')); // GPT4All

      const result = await discoverLocalProviders();

      expect(result).toHaveLength(4);

      const ollamaProvider = result.find((p) => p.name === 'Ollama');
      expect(ollamaProvider).toBeDefined();
      expect(ollamaProvider?.status).toBe('available');
      expect(ollamaProvider?.models).toHaveLength(1);
      expect(ollamaProvider?.baseUrl).toBe('http://127.0.0.1:11434');
    });

    it('should discover multiple providers when available', async () => {
      const mockOllamaResponse = { models: [{ name: 'gemma:7b', details: { parameter_size: '7B' } }] };
      const mockLMStudioResponse = { data: [{ id: 'model-1', context_length: 4096 }] };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockOllamaResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLMStudioResponse,
        })
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'));

      const result = await discoverLocalProviders();

      const ollamaProvider = result.find((p) => p.name === 'Ollama');
      const lmstudioProvider = result.find((p) => p.name === 'LMStudio');

      expect(ollamaProvider?.status).toBe('available');
      expect(lmstudioProvider?.status).toBe('available');
      expect(ollamaProvider?.responseTime).toBeDefined();
      expect(lmstudioProvider?.responseTime).toBeDefined();
    });

    it('should handle all providers unavailable', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await discoverLocalProviders();

      expect(result.every((p) => p.status === 'unavailable')).toBe(true);
    });

    it('should handle timeout errors gracefully', async () => {
      mockFetch.mockRejectedValue(new DOMException('TimeoutError', 'TimeoutError'));

      const result = await discoverLocalProviders();

      // Should not throw, should return unavailable providers
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should try alternative URLs for each provider', async () => {
      const mockResponse = { models: [{ name: 'test', details: { parameter_size: '1B' } }] };

      // First URL (127.0.0.1) fails, second URL (localhost) succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Connection refused')) // 127.0.0.1:11434
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        }) // localhost:11434
        .mockRejectedValue(new Error('Connection refused')); // Other providers

      const result = await discoverLocalProviders();

      const ollamaProvider = result.find((p) => p.name === 'Ollama');
      expect(ollamaProvider?.status).toBe('available');
      expect(ollamaProvider?.baseUrl).toBe('http://localhost:11434');
    });

    it('should measure response time', async () => {
      const mockResponse = { models: [{ name: 'test', details: { parameter_size: '1B' } }] };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await discoverLocalProviders();

      const availableProvider = result.find((p) => p.status === 'available');
      expect(availableProvider?.responseTime).toBeDefined();
      expect(typeof availableProvider?.responseTime).toBe('number');
    });
  });

  describe('checkProviderAvailability', () => {
    it('should return available when health check succeeds', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await checkProviderAvailability('http://127.0.0.1:11434', '/api/tags');

      expect(result.available).toBe(true);
      expect(result.responseTime).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should try alternative endpoints when health check fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('/health failed')).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await checkProviderAvailability('http://127.0.0.1:11434', '/health');

      expect(result.available).toBe(true);
    });

    it('should return unavailable when all endpoints fail', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await checkProviderAvailability('http://127.0.0.1:11434', '/health');

      expect(result.available).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      const result = await checkProviderAvailability('http://127.0.0.1:11434');

      expect(result.available).toBe(false);
    });

    it('should respect timeout', async () => {
      mockFetch.mockRejectedValue(new Error('Timeout'));

      const result = await checkProviderAvailability('http://127.0.0.1:11434');

      expect(result.available).toBe(false);
      expect(result.error).toContain('Timeout');
    });
  });

  describe('getRecommendedProvider', () => {
    it('should recommend provider with most models', () => {
      const providers: DiscoveredProvider[] = [
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'available',
          models: [{ name: 'model1', label: 'Model 1', provider: 'Ollama' }] as ModelInfo[],
          responseTime: 50,
        },
        {
          name: 'LMStudio',
          baseUrl: 'http://127.0.0.1:1234',
          status: 'available',
          models: [
            { name: 'model1', label: 'Model 1', provider: 'LMStudio' },
            { name: 'model2', label: 'Model 2', provider: 'LMStudio' },
            { name: 'model3', label: 'Model 3', provider: 'LMStudio' },
          ] as ModelInfo[],
          responseTime: 100,
        },
      ];

      const recommended = getRecommendedProvider(providers);

      expect(recommended?.name).toBe('LMStudio');
    });

    it('should use response time as tiebreaker', () => {
      const providers: DiscoveredProvider[] = [
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'available',
          models: [{ name: 'model1', label: 'Model 1', provider: 'Ollama' }] as ModelInfo[],
          responseTime: 30,
        },
        {
          name: 'LMStudio',
          baseUrl: 'http://127.0.0.1:1234',
          status: 'available',
          models: [{ name: 'model1', label: 'Model 1', provider: 'LMStudio' }] as ModelInfo[],
          responseTime: 50,
        },
      ];

      const recommended = getRecommendedProvider(providers);

      expect(recommended?.name).toBe('Ollama');
    });

    it('should return null when no providers available', () => {
      const providers: DiscoveredProvider[] = [
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'unavailable',
          models: [],
          error: 'Connection refused',
        },
      ];

      const recommended = getRecommendedProvider(providers);

      expect(recommended).toBeNull();
    });

    it('should handle empty providers array', () => {
      const recommended = getRecommendedProvider([]);
      expect(recommended).toBeNull();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle realistic Ollama discovery flow', async () => {
      const realisticOllamaResponse = {
        models: [
          {
            name: 'gemma2:2b',
            model: 'gemma2:2b',
            modified_at: '2024-01-15T10:30:00Z',
            size: 1621069741,
            digest: 'abc123',
            details: {
              parent_model: '',
              format: 'gguf',
              family: 'gemma2',
              families: ['gemma2'],
              parameter_size: '2B',
              quantization_level: 'Q4_0',
            },
          },
          {
            name: 'llama3.2:1b',
            model: 'llama3.2:1b',
            modified_at: '2024-01-15T11:00:00Z',
            size: 1239283853,
            digest: 'def456',
            details: {
              parent_model: '',
              format: 'gguf',
              family: 'llama',
              families: ['llama'],
              parameter_size: '1B',
              quantization_level: 'Q4_K_M',
            },
          },
          {
            name: 'codellama:7b',
            model: 'codellama:7b',
            modified_at: '2024-01-14T09:00:00Z',
            size: 3791738353,
            digest: 'ghi789',
            details: {
              parent_model: '',
              format: 'gguf',
              family: 'llama',
              families: ['llama'],
              parameter_size: '7B',
              quantization_level: 'Q4_0',
            },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => realisticOllamaResponse,
      });

      const result = await discoverLocalProviders();

      const ollamaProvider = result.find((p) => p.name === 'Ollama');
      expect(ollamaProvider?.status).toBe('available');
      expect(ollamaProvider?.models).toHaveLength(3);
      expect(ollamaProvider?.models.map((m) => m.name)).toEqual(
        expect.arrayContaining(['gemma2:2b', 'llama3.2:1b', 'codellama:7b']),
      );
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      const result = await discoverLocalProviders();

      // Should not crash, should return unavailable providers
      expect(result).toBeDefined();
      expect(result.every((p) => p.status === 'unavailable' || p.status === 'available')).toBe(true);
    });
  });
});
