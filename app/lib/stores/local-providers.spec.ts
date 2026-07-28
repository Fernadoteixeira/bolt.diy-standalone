import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  localProvidersStore,
  checkProviderHealth,
  discoverAndUpdateProviders,
  addManualProvider,
  removeProvider,
  getHealthyProviders,
  getProviderByName,
  startProviderHealthCheck,
} from '~/lib/stores/local-providers';
import type { ProviderHealthStatus } from '~/lib/stores/local-providers';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the discovery service
vi.mock('~/lib/services/local-provider-discovery', () => ({
  discoverLocalProviders: vi.fn(),
  checkProviderAvailability: vi.fn(),
}));

const { discoverLocalProviders, checkProviderAvailability } = await import('~/lib/services/local-provider-discovery');

describe('Local Providers Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset store to empty state
    localProvidersStore.set([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('localProvidersStore', () => {
    it('should initialize with empty array', () => {
      const state = localProvidersStore.get();
      expect(state).toEqual([]);
    });

    it('should update state when setting providers', () => {
      const mockProviders: ProviderHealthStatus[] = [
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'healthy',
          modelCount: 3,
        },
      ];

      localProvidersStore.set(mockProviders);

      expect(localProvidersStore.get()).toEqual(mockProviders);
    });

    it('should notify subscribers on state changes', () => {
      const subscriber = vi.fn();
      const unsubscribe = localProvidersStore.subscribe(subscriber);

      const mockProviders: ProviderHealthStatus[] = [
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'healthy',
          modelCount: 3,
        },
      ];

      localProvidersStore.set(mockProviders);

      expect(subscriber).toHaveBeenCalledWith(mockProviders, [], undefined);

      unsubscribe();
    });
  });

  describe('checkProviderHealth', () => {
    it('should return healthy status when provider is available', async () => {
      vi.mocked(checkProviderAvailability).mockResolvedValue({
        available: true,
        responseTime: 45,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{}, {}, {}] }),
      });

      const result = await checkProviderHealth('Ollama', 'http://127.0.0.1:11434');

      expect(result.status).toBe('healthy');
      expect(result.responseTime).toBe(45);
      expect(result.modelCount).toBe(3);
      expect(result.error).toBeUndefined();
    });

    it('should return unhealthy status when provider is unavailable', async () => {
      vi.mocked(checkProviderAvailability).mockResolvedValue({
        available: false,
        error: 'Connection refused',
      });

      const result = await checkProviderHealth('Ollama', 'http://127.0.0.1:11434');

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Connection refused');
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(checkProviderAvailability).mockRejectedValue(new Error('Network error'));

      const result = await checkProviderHealth('Ollama', 'http://127.0.0.1:11434');

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Network error');
    });

    it('should measure response time', async () => {
      vi.mocked(checkProviderAvailability).mockResolvedValue({
        available: true,
        responseTime: 123,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const result = await checkProviderHealth('Ollama', 'http://127.0.0.1:11434');

      expect(result.responseTime).toBe(123);
    });

    it('should count models correctly', async () => {
      vi.mocked(checkProviderAvailability).mockResolvedValue({
        available: true,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{}, {}, {}, {}, {}] }),
      });

      const result = await checkProviderHealth('Ollama', 'http://127.0.0.1:11434');

      expect(result.modelCount).toBe(5);
    });
  });

  describe('discoverAndUpdateProviders', () => {
    it('should discover providers and update store', async () => {
      const mockDiscoveredProviders = [
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'available' as const,
          models: [{ name: 'gemma:7b', label: 'gemma:7b', provider: 'Ollama', maxTokenAllowed: 4096 }],
          responseTime: 50,
        },
        {
          name: 'LMStudio',
          baseUrl: 'http://127.0.0.1:1234',
          status: 'unavailable' as const,
          models: [],
          error: 'Connection refused',
        },
      ];

      vi.mocked(discoverLocalProviders).mockResolvedValue(mockDiscoveredProviders);

      await discoverAndUpdateProviders();

      const state = localProvidersStore.get();

      expect(state).toHaveLength(2);
      expect(state[0].name).toBe('Ollama');
      expect(state[0].status).toBe('healthy');
      expect(state[0].modelCount).toBe(1);
      expect(state[1].name).toBe('LMStudio');
      expect(state[1].status).toBe('unhealthy');
    });

    it('should set discovering status during discovery', async () => {
      localProvidersStore.set([
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'healthy',
        },
      ]);

      vi.mocked(discoverLocalProviders).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve([
                {
                  name: 'Ollama',
                  baseUrl: 'http://127.0.0.1:11434',
                  status: 'available',
                  models: [],
                },
              ]);
            }, 100);
          }),
      );

      // Don't await, check intermediate state
      discoverAndUpdateProviders();

      // Give it time to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      const state = localProvidersStore.get();
      expect(state[0].status).toBe('discovering');
    });

    it('should handle discovery errors gracefully', async () => {
      vi.mocked(discoverLocalProviders).mockRejectedValue(new Error('Discovery failed'));

      await discoverAndUpdateProviders();

      // Should not crash, should have empty or previous state
      const state = localProvidersStore.get();
      expect(state).toBeDefined();
    });
  });

  describe('addManualProvider', () => {
    it('should add a provider to the store', () => {
      const provider: ProviderHealthStatus = {
        name: 'Custom Provider',
        baseUrl: 'http://custom:8080',
        status: 'healthy',
        autoDiscovered: false,
      };

      addManualProvider(provider);

      const state = localProvidersStore.get();
      expect(state).toHaveLength(1);
      expect(state[0]).toEqual(provider);
    });

    it('should append to existing providers', () => {
      localProvidersStore.set([
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'healthy',
        },
      ]);

      const provider: ProviderHealthStatus = {
        name: 'LMStudio',
        baseUrl: 'http://127.0.0.1:1234',
        status: 'healthy',
        autoDiscovered: false,
      };

      addManualProvider(provider);

      const state = localProvidersStore.get();
      expect(state).toHaveLength(2);
      expect(state[1].name).toBe('LMStudio');
    });
  });

  describe('removeProvider', () => {
    it('should remove a provider by baseUrl', () => {
      localProvidersStore.set([
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'healthy',
        },
        {
          name: 'LMStudio',
          baseUrl: 'http://127.0.0.1:1234',
          status: 'healthy',
        },
      ]);

      removeProvider('http://127.0.0.1:1234');

      const state = localProvidersStore.get();
      expect(state).toHaveLength(1);
      expect(state[0].baseUrl).toBe('http://127.0.0.1:11434');
    });

    it('should handle non-existent provider', () => {
      localProvidersStore.set([
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'healthy',
        },
      ]);

      removeProvider('http://non-existent:8080');

      const state = localProvidersStore.get();
      expect(state).toHaveLength(1); // Should remain unchanged
    });
  });

  describe('getHealthyProviders', () => {
    it('should return only healthy providers', () => {
      localProvidersStore.set([
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'healthy',
          modelCount: 3,
        },
        {
          name: 'LMStudio',
          baseUrl: 'http://127.0.0.1:1234',
          status: 'unhealthy',
          error: 'Connection refused',
        },
        {
          name: 'Jan',
          baseUrl: 'http://127.0.0.1:1337',
          status: 'healthy',
          modelCount: 1,
        },
      ]);

      const healthy = getHealthyProviders();

      expect(healthy).toHaveLength(2);
      expect(healthy.every((p) => p.status === 'healthy')).toBe(true);
    });

    it('should return empty array when no healthy providers', () => {
      localProvidersStore.set([
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'unhealthy',
        },
        {
          name: 'LMStudio',
          baseUrl: 'http://127.0.0.1:1234',
          status: 'unknown',
        },
      ]);

      const healthy = getHealthyProviders();
      expect(healthy).toHaveLength(0);
    });
  });

  describe('getProviderByName', () => {
    it('should find provider by name', () => {
      localProvidersStore.set([
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'healthy',
        },
        {
          name: 'LMStudio',
          baseUrl: 'http://127.0.0.1:1234',
          status: 'healthy',
        },
      ]);

      const provider = getProviderByName('LMStudio');

      expect(provider).toBeDefined();
      expect(provider?.name).toBe('LMStudio');
    });

    it('should return undefined for non-existent provider', () => {
      localProvidersStore.set([
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'healthy',
        },
      ]);

      const provider = getProviderByName('NonExistent');

      expect(provider).toBeUndefined();
    });
  });

  describe('startProviderHealthCheck', () => {
    it('should perform initial discovery', async () => {
      const mockDiscoveredProviders = [
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'available' as const,
          models: [{ name: 'gemma:7b', label: 'gemma:7b', provider: 'Ollama', maxTokenAllowed: 4096 }],
          responseTime: 50,
        },
      ];

      vi.mocked(discoverLocalProviders).mockResolvedValue(mockDiscoveredProviders);

      const cleanup = startProviderHealthCheck(1000); // 1 second interval for test

      // Wait for initial discovery
      await new Promise((resolve) => setTimeout(resolve, 100));

      const state = localProvidersStore.get();
      expect(state.length).toBeGreaterThan(0);

      cleanup();
    });

    it('should periodically check health', async () => {
      localProvidersStore.set([
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'healthy',
        },
      ]);

      vi.mocked(checkProviderAvailability).mockResolvedValue({
        available: true,
        responseTime: 50,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const cleanup = startProviderHealthCheck(50); // 50ms interval for test

      // Wait for at least one check cycle
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(checkProviderAvailability).toHaveBeenCalled();

      cleanup();
    });

    it('should return cleanup function', () => {
      const cleanup = startProviderHealthCheck(60000); // 1 minute interval

      expect(typeof cleanup).toBe('function');

      cleanup();

      // Should not throw
      expect(() => cleanup()).not.toThrow();
    });
  });

  describe('State Transitions', () => {
    it('should handle healthy -> unhealthy transition', async () => {
      // Initial healthy state
      localProvidersStore.set([
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'healthy',
          modelCount: 3,
        },
      ]);

      // Simulate health check failure
      vi.mocked(checkProviderAvailability).mockResolvedValue({
        available: false,
        error: 'Service stopped',
      });

      const health = await checkProviderHealth('Ollama', 'http://127.0.0.1:11434');

      expect(health.status).toBe('unhealthy');
      expect(health.error).toBe('Service stopped');
    });

    it('should handle unhealthy -> healthy transition', async () => {
      // Initial unhealthy state
      localProvidersStore.set([
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'unhealthy',
          error: 'Connection refused',
        },
      ]);

      // Simulate health check success
      vi.mocked(checkProviderAvailability).mockResolvedValue({
        available: true,
        responseTime: 45,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{}] }),
      });

      const health = await checkProviderHealth('Ollama', 'http://127.0.0.1:11434');

      expect(health.status).toBe('healthy');
      expect(health.modelCount).toBe(1);
    });
  });

  describe('Multiple Providers Scenario', () => {
    it('should manage multiple providers correctly', async () => {
      const providers: ProviderHealthStatus[] = [
        {
          name: 'Ollama',
          baseUrl: 'http://127.0.0.1:11434',
          status: 'healthy',
          modelCount: 5,
          responseTime: 45,
        },
        {
          name: 'LMStudio',
          baseUrl: 'http://127.0.0.1:1234',
          status: 'healthy',
          modelCount: 3,
          responseTime: 60,
        },
        {
          name: 'Jan',
          baseUrl: 'http://127.0.0.1:1337',
          status: 'unhealthy',
          error: 'Not running',
        },
        {
          name: 'GPT4All',
          baseUrl: 'http://127.0.0.1:4891',
          status: 'unknown',
        },
      ];

      localProvidersStore.set(providers);

      expect(getHealthyProviders()).toHaveLength(2);
      expect(getProviderByName('Ollama')?.status).toBe('healthy');
      expect(getProviderByName('Jan')?.status).toBe('unhealthy');
      expect(getProviderByName('GPT4All')?.status).toBe('unknown');

      removeProvider('http://127.0.0.1:1337');

      expect(localProvidersStore.get()).toHaveLength(3);
    });
  });
});
