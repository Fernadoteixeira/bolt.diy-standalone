import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LMStudioProvider from '~/lib/modules/llm/providers/lmstudio';

// cspell:words lmstudio LMStudio

// Mock the OpenAI SDK (LMStudio uses the OpenAI-compatible API with a local baseURL).
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'lmstudio' }))),
}));

// Mock fetch globally so no real network calls are made.
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('LMStudioProvider', () => {
  let provider: LMStudioProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new LMStudioProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name, API key link, and icon', () => {
      expect(provider.name).toBe('LMStudio');
      expect(provider.getApiKeyLink).toBe('https://lmstudio.ai/');
      expect(provider.labelForGetApiKey).toBe('Get LMStudio');
      expect(provider.icon).toBe('i-ph:cloud-arrow-down');
    });

    it('should use LMSTUDIO_API_BASE_URL as the base URL key', () => {
      expect(provider.config.baseUrlKey).toBe('LMSTUDIO_API_BASE_URL');
    });

    it('should have a default base URL of http://localhost:1234/', () => {
      expect(provider.config.baseUrl).toBe('http://localhost:1234/');
    });

    it('should have an empty staticModels array', () => {
      expect(provider.staticModels).toEqual([]);
    });
  });

  describe('getDynamicModels', () => {
    const serverEnv = { LMSTUDIO_API_BASE_URL: 'http://localhost:1234' };

    it('should use the default base URL from config when no serverEnv or settings are provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      // LMStudio has a default baseUrl of 'http://localhost:1234/' in config,
      // so it does NOT throw when no baseUrl is configured via env/settings.
      await provider.getDynamicModels({}, undefined, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:1234/v1/models',
        expect.anything(),
      );
    });

    it('should fetch models from {baseUrl}/v1/models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await provider.getDynamicModels({}, undefined, serverEnv);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:1234/v1/models',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('should use the default base URL from config when serverEnv does not override it', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      // When serverEnv is empty, the config.baseUrl ('http://localhost:1234/') is used.
      // getProviderBaseUrlAndKey strips the trailing slash.
      await provider.getDynamicModels({}, undefined, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:1234/v1/models',
        expect.anything(),
      );
    });

    it('should map the response data to ModelInfo objects', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'local-model-1' }, { id: 'local-model-2' }],
        }),
      });

      const models = await provider.getDynamicModels({}, undefined, serverEnv);

      expect(models).toHaveLength(2);
      expect(models[0].name).toBe('local-model-1');
      expect(models[0].label).toBe('local-model-1');
      expect(models[0].provider).toBe('LMStudio');
      expect(models[0].maxTokenAllowed).toBe(8000);
    });

    it('should return an empty list when the HTTP response is not ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const models = await provider.getDynamicModels({}, undefined, serverEnv);
      expect(models).toEqual([]);
    });

    it('should return an empty list and warn when the request times out', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      mockFetch.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'));

      const models = await provider.getDynamicModels({}, undefined, serverEnv);

      expect(models).toEqual([]);
    });

    it('should return an empty list and warn when LMStudio is not reachable', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      const models = await provider.getDynamicModels({}, undefined, serverEnv);

      expect(models).toEqual([]);
    });

    it('should resolve baseUrl from providerSettings', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const settings = { baseUrl: 'http://192.168.1.100:1234' } as any;
      await provider.getDynamicModels({}, settings, {});

      expect(mockFetch).toHaveBeenCalledWith(
        'http://192.168.1.100:1234/v1/models',
        expect.anything(),
      );
    });
  });

  describe('getModelInstance', () => {
    it('should use the default base URL from config when no baseUrl is configured', () => {
      // LMStudio has a default baseUrl of 'http://localhost:1234/' in config,
      // so getModelInstance uses the default URL without throwing.
      const instance = provider.getModelInstance({
        model: 'test-model',
        serverEnv: {} as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('test-model');
    });

    it('should return a model instance using the configured base URL', () => {
      const instance = provider.getModelInstance({
        model: 'local-model',
        serverEnv: { LMSTUDIO_API_BASE_URL: 'http://localhost:1234' } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('local-model');
    });

    it('should use the default base URL from config when no serverEnv is provided', () => {
      const instance = provider.getModelInstance({
        model: 'local-model',
        serverEnv: {} as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('local-model');
    });

    it('should resolve baseUrl from providerSettings', () => {
      const instance = provider.getModelInstance({
        model: 'test-model',
        serverEnv: {} as any,
        apiKeys: {},
        providerSettings: {
          LMStudio: { baseUrl: 'http://192.168.1.100:1234' } as any,
        },
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('test-model');
    });
  });
});