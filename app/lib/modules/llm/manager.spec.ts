import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseProvider } from '~/lib/modules/llm/base-provider';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { ModelInfo, ProviderConfig } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';

// Mock provider for testing
class MockProvider extends BaseProvider {
  name = 'MockProvider';
  staticModels: ModelInfo[] = [
    {
      name: 'mock-model-1',
      label: 'Mock Model 1',
      provider: this.name,
      maxTokenAllowed: 4096,
    },
    {
      name: 'mock-model-2',
      label: 'Mock Model 2',
      provider: this.name,
      maxTokenAllowed: 8192,
    },
  ];

  config: ProviderConfig = {
    baseUrlKey: 'MOCK_API_BASE_URL',
    apiTokenKey: 'MOCK_API_KEY',
  };

  getDynamicModels = vi.fn().mockResolvedValue([
    {
      name: 'dynamic-model-1',
      label: 'Dynamic Model 1',
      provider: this.name,
      maxTokenAllowed: 16384,
    },
  ]);

  getModelInstance = vi.fn();
}

describe('LLM Manager', () => {
  let llmManager: LLMManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset singleton
    (LLMManager as any)._instance = null;
    llmManager = LLMManager.getInstance({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return same instance on subsequent calls', () => {
      const instance1 = LLMManager.getInstance({});
      const instance2 = LLMManager.getInstance({});
      expect(instance1).toBe(instance2);
    });

    it('should update env when provided on subsequent calls', () => {
      const instance1 = LLMManager.getInstance({ KEY1: 'value1' });
      expect(instance1.env.KEY1).toBe('value1');

      const instance2 = LLMManager.getInstance({ KEY2: 'value2' });
      expect(instance2.env.KEY2).toBe('value2');
      expect(instance2.env.KEY1).toBe('value1'); // Should preserve previous
    });
  });

  describe('Provider Registration', () => {
    it('should register a provider successfully', () => {
      const mockProvider = new MockProvider();
      llmManager.registerProvider(mockProvider);

      const retrieved = llmManager.getProvider('MockProvider');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('MockProvider');
    });

    it('should warn when registering duplicate provider', () => {
      const mockProvider = new MockProvider();
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      llmManager.registerProvider(mockProvider);
      llmManager.registerProvider(mockProvider);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('already registered'));

      consoleLogSpy.mockRestore();
    });

    it('should handle provider registration errors gracefully', () => {
      const badProvider = {
        name: 'BadProvider',
        staticModels: undefined, // This should cause an error
      };

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // @ts-ignore - intentionally testing bad input
      llmManager.registerProvider(badProvider);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Failed To Register'));

      consoleLogSpy.mockRestore();
    });
  });

  describe('Provider Retrieval', () => {
    beforeEach(() => {
      llmManager.registerProvider(new MockProvider());
    });

    it('should get provider by name', () => {
      const provider = llmManager.getProvider('MockProvider');
      expect(provider).toBeDefined();
      expect(provider?.name).toBe('MockProvider');
    });

    it('should return undefined for non-existent provider', () => {
      const provider = llmManager.getProvider('NonExistent');
      expect(provider).toBeUndefined();
    });

    it('should get all registered providers', () => {
      const providers = llmManager.getAllProviders();
      expect(providers.length).toBeGreaterThan(0);
      expect(providers.some((p) => p.name === 'MockProvider')).toBe(true);
    });
  });

  describe('Model Management', () => {
    beforeEach(() => {
      llmManager.registerProvider(new MockProvider());
    });

    it('should get model list including static models', () => {
      const modelList = llmManager.getStaticModelList();
      expect(modelList.length).toBeGreaterThan(0);
      expect(modelList.some((m) => m.name === 'mock-model-1')).toBe(true);
    });

    it('should get static models from specific provider', () => {
      const models = llmManager.getStaticModelListFromProvider(new MockProvider());
      expect(models).toHaveLength(2);
      expect(models.map((m) => m.name)).toEqual(['mock-model-1', 'mock-model-2']);
    });

    it('should throw error for non-existent provider', () => {
      expect(() => {
        llmManager.getStaticModelListFromProvider({ name: 'NonExistent' } as any);
      }).toThrow('not found');
    });

    it('should update model list with dynamic models', async () => {
      const modelList = await llmManager.updateModelList({
        apiKeys: {},
        providerSettings: {},
        serverEnv: {},
      });

      expect(modelList.length).toBeGreaterThan(0);

      // Should include both static and dynamic models
      expect(modelList.some((m) => m.name === 'mock-model-1')).toBe(true);
      expect(modelList.some((m) => m.name === 'dynamic-model-1')).toBe(true);
    });

    it('should filter providers by enabled settings', async () => {
      const providerSettings: Record<string, IProviderSetting> = {
        MockProvider: { enabled: false },
      };

      const modelList = await llmManager.updateModelList({
        apiKeys: {},
        providerSettings,
        serverEnv: {},
      });

      // Should not include dynamic models from disabled provider
      expect(modelList.some((m) => m.name === 'dynamic-model-1')).toBe(false);
    });

    it('should cache dynamic models', async () => {
      const mockProvider = llmManager.getProvider('MockProvider') as MockProvider;
      const storeDynamicModelsSpy = vi.spyOn(mockProvider, 'storeDynamicModels');

      await llmManager.updateModelList({
        apiKeys: {},
        providerSettings: {},
        serverEnv: {},
      });

      expect(storeDynamicModelsSpy).toHaveBeenCalled();
    });

    it('should handle dynamic model fetch errors', async () => {
      const mockProvider = new MockProvider();
      mockProvider.getDynamicModels = vi.fn().mockRejectedValue(new Error('API Error'));

      llmManager.registerProvider(mockProvider);

      const modelList = await llmManager.updateModelList({
        apiKeys: {},
        providerSettings: {},
        serverEnv: {},
      });

      // Should still return static models
      expect(modelList.some((m) => m.name === 'mock-model-1')).toBe(true);
    });

    it('should sort models alphabetically', async () => {
      const modelList = await llmManager.updateModelList({
        apiKeys: {},
        providerSettings: {},
        serverEnv: {},
      });

      const sorted = [...modelList].sort((a, b) => a.name.localeCompare(b.name));
      expect(modelList.map((m) => m.name)).toEqual(sorted.map((m) => m.name));
    });
  });

  describe('Default Provider', () => {
    it('should return first provider when no default configured', () => {
      llmManager.registerProvider(new MockProvider());

      const defaultProvider = llmManager.getDefaultProvider();
      expect(defaultProvider).toBeDefined();
    });

    it('should throw error when no providers registered', () => {
      // Reset to empty state
      (LLMManager as any)._instance = null;

      const emptyManager = LLMManager.getInstance({});

      /*
       * The manager auto-registers all real providers on construction; clear them
       * to exercise the "no providers registered" edge case in isolation.
       */
      (emptyManager as any)._providers.clear();

      expect(() => emptyManager.getDefaultProvider()).toThrow('No providers registered');
    });
  });

  describe('Environment Management', () => {
    it('should store and retrieve environment variables', () => {
      const env = {
        MOCK_API_KEY: 'test-key',
        MOCK_API_BASE_URL: 'http://test.com',
        DEFAULT_NUM_CTX: '32768',
      };

      (LLMManager as any)._instance = null;

      const manager = LLMManager.getInstance(env);

      expect(manager.env).toEqual(env);
    });

    it('should handle empty environment', () => {
      (LLMManager as any)._instance = null;

      const manager = LLMManager.getInstance({});

      expect(manager.env).toEqual({});
    });
  });

  describe('Provider Model List From Provider', () => {
    let mockProvider: MockProvider;

    beforeEach(() => {
      mockProvider = new MockProvider();
      llmManager.registerProvider(mockProvider);
    });

    it('should get model list from specific provider', async () => {
      const models = await llmManager.getModelListFromProvider(mockProvider, {
        apiKeys: {},
        providerSettings: {},
        serverEnv: {},
      });

      expect(models.length).toBeGreaterThan(0);
      expect(models.some((m) => m.name === 'mock-model-1')).toBe(true);
    });

    it('should use cached models when available', async () => {
      // First call - should fetch dynamic models
      await llmManager.getModelListFromProvider(mockProvider, {
        apiKeys: {},
        providerSettings: {},
        serverEnv: {},
      });

      // Second call - should use cache
      const models2 = await llmManager.getModelListFromProvider(mockProvider, {
        apiKeys: {},
        providerSettings: {},
        serverEnv: {},
      });

      expect(models2.length).toBeGreaterThan(0);
    });

    it('should handle provider without dynamic models', async () => {
      const staticOnlyProvider = new (class extends BaseProvider {
        name = 'StaticOnly';
        staticModels: ModelInfo[] = [
          {
            name: 'static-1',
            label: 'Static 1',
            provider: this.name,
            maxTokenAllowed: 4096,
          },
        ];
        config = { baseUrlKey: 'STATIC_URL' };
        getModelInstance = vi.fn();
      })();

      llmManager.registerProvider(staticOnlyProvider);

      const models = await llmManager.getModelListFromProvider(staticOnlyProvider, {
        apiKeys: {},
        providerSettings: {},
        serverEnv: {},
      });

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('static-1');
    });
  });

  describe('Concurrent Access', () => {
    it('should handle concurrent model list updates', async () => {
      const mockProvider = new MockProvider();
      llmManager.registerProvider(mockProvider);

      // Simulate concurrent updates
      const promises = Array.from({ length: 5 }, () =>
        llmManager.updateModelList({
          apiKeys: {},
          providerSettings: {},
          serverEnv: {},
        }),
      );

      const results = await Promise.all(promises);

      // All should complete successfully
      expect(results.every((r) => Array.isArray(r))).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined options', async () => {
      const modelList = await llmManager.updateModelList({
        apiKeys: undefined as any,
        providerSettings: undefined as any,
        serverEnv: undefined as any,
      });

      expect(Array.isArray(modelList)).toBe(true);
    });

    it('should handle empty provider settings', async () => {
      const modelList = await llmManager.updateModelList({
        apiKeys: {},
        providerSettings: {},
        serverEnv: {},
      });

      expect(Array.isArray(modelList)).toBe(true);
    });

    it('should handle very large model lists', async () => {
      const largeProvider = new (class extends BaseProvider {
        name = 'LargeProvider';
        staticModels: ModelInfo[] = Array.from({ length: 100 }, (_, i) => ({
          name: `model-${i}`,
          label: `Model ${i}`,
          provider: this.name,
          maxTokenAllowed: 4096,
        }));
        config = { baseUrlKey: 'LARGE_URL' };
        getDynamicModels = vi.fn().mockResolvedValue(
          Array.from({ length: 50 }, (_, i) => ({
            name: `dynamic-${i}`,
            label: `Dynamic ${i}`,
            provider: this.name,
            maxTokenAllowed: 8192,
          })),
        );
        getModelInstance = vi.fn();
      })();

      llmManager.registerProvider(largeProvider);

      const modelList = await llmManager.updateModelList({
        apiKeys: {},
        providerSettings: {},
        serverEnv: {},
      });

      expect(modelList.length).toBeGreaterThan(100);
    });
  });
});
