import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalModelHealthMonitor } from './localModelHealthMonitor';
import type { ModelHealthStatus } from './localModelHealthMonitor';

/**
 * Helper to build a mock fetch Response.
 */
function mockResponse(body: unknown, init: { ok?: boolean; status?: number; type?: string } = {}) {
  const ok = init.ok ?? (init.status ? init.status >= 200 && init.status < 300 : true);

  return {
    ok,
    status: init.status ?? 200,
    statusText: ok ? 'OK' : 'Error',
    json: vi.fn(async () => body),
    text: vi.fn(async () => JSON.stringify(body)),
    headers: new Headers(),
    type: init.type ?? 'basic',
  } as any;
}

describe('LocalModelHealthMonitor', () => {
  let monitor: LocalModelHealthMonitor;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch = vi.fn();
    global.fetch = mockFetch as any;
    monitor = new LocalModelHealthMonitor();
    vi.spyOn(console, 'log').mockImplementation(() => { /* no-op */ });
    vi.spyOn(console, 'error').mockImplementation(() => { /* no-op */ });
  });

  afterEach(() => {
    monitor.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('startMonitoring / stopMonitoring', () => {
    it('should initialize health status and immediately start checking', () => {
      monitor.startMonitoring('Ollama', 'http://localhost:11434');
      const status = monitor.getHealthStatus('Ollama', 'http://localhost:11434');
      expect(status).toBeDefined();
      // startMonitoring sets status to 'unknown' then immediately calls
      // performHealthCheck, which synchronously sets status to 'checking'
      // before the first await. So 'unknown' is not observable.
      expect(status!.status).toBe('checking');
      expect(status!.provider).toBe('Ollama');
      expect(status!.baseUrl).toBe('http://localhost:11434');
    });

    it('should remove status when monitoring is stopped', () => {
      monitor.startMonitoring('Ollama', 'http://localhost:11434');
      expect(monitor.getHealthStatus('Ollama', 'http://localhost:11434')).toBeDefined();

      monitor.stopMonitoring('Ollama', 'http://localhost:11434');
      expect(monitor.getHealthStatus('Ollama', 'http://localhost:11434')).toBeUndefined();
    });

    it('should support multiple providers simultaneously', () => {
      monitor.startMonitoring('Ollama', 'http://localhost:11434');
      monitor.startMonitoring('LMStudio', 'http://localhost:1234');

      const all = monitor.getAllHealthStatuses();
      expect(all).toHaveLength(2);
      expect(all.map((s) => s.provider)).toContain('Ollama');
      expect(all.map((s) => s.provider)).toContain('LMStudio');
    });

    it('should restart monitoring when startMonitoring is called for the same provider', () => {
      monitor.startMonitoring('Ollama', 'http://localhost:11434', 60000);
      monitor.startMonitoring('Ollama', 'http://localhost:11434', 30000);

      // Should still only have one entry
      expect(monitor.getAllHealthStatuses()).toHaveLength(1);
    });
  });

  describe('getHealthStatus / getAllHealthStatuses', () => {
    it('should return undefined for unmonitored provider', () => {
      expect(monitor.getHealthStatus('Ollama', 'http://localhost:11434')).toBeUndefined();
    });

    it('should return empty array when nothing is monitored', () => {
      expect(monitor.getAllHealthStatuses()).toEqual([]);
    });
  });

  describe('performHealthCheck - Ollama', () => {
    it('should report healthy when Ollama responds with models', async () => {
      monitor.startMonitoring('Ollama', 'http://localhost:11434');

      const tagsResponse = {
        models: [{ name: 'llama3.2:3b' }, { name: 'gemma:7b' }],
      };
      const versionResponse = { version: '0.1.32' };

      mockFetch
        .mockResolvedValueOnce(mockResponse(tagsResponse))
        .mockResolvedValueOnce(mockResponse(versionResponse));

      const result = await monitor.performHealthCheck('Ollama', 'http://localhost:11434');

      expect(result.isHealthy).toBe(true);
      expect(result.availableModels).toEqual(['llama3.2:3b', 'gemma:7b']);
      expect(result.version).toBe('0.1.32');
      expect(result.responseTime).toBeGreaterThanOrEqual(0);

      const status = monitor.getHealthStatus('Ollama', 'http://localhost:11434');
      expect(status!.status).toBe('healthy');
      expect(status!.availableModels).toEqual(['llama3.2:3b', 'gemma:7b']);
    });

    it('should report unhealthy when Ollama returns a non-OK response', async () => {
      monitor.startMonitoring('Ollama', 'http://localhost:11434');

      mockFetch.mockResolvedValueOnce(
        mockResponse({ message: 'Server error' }, { ok: false, status: 500 }),
      );

      const result = await monitor.performHealthCheck('Ollama', 'http://localhost:11434');

      expect(result.isHealthy).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });

    it('should report unhealthy when fetch fails (connection refused)', async () => {
      monitor.startMonitoring('Ollama', 'http://localhost:11434');

      mockFetch.mockRejectedValue(new Error('fetch failed'));

      const result = await monitor.performHealthCheck('Ollama', 'http://localhost:11434');

      expect(result.isHealthy).toBe(false);
      expect(result.error).toBe('fetch failed');
    });

    it('should handle empty models list', async () => {
      monitor.startMonitoring('Ollama', 'http://localhost:11434');

      mockFetch.mockResolvedValueOnce(mockResponse({ models: [] }));

      const result = await monitor.performHealthCheck('Ollama', 'http://localhost:11434');
      expect(result.isHealthy).toBe(true);
      expect(result.availableModels).toEqual([]);
    });
  });

  describe('performHealthCheck - LMStudio', () => {
    it('should report healthy when LMStudio responds with models', async () => {
      monitor.startMonitoring('LMStudio', 'http://localhost:1234');

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          data: [{ id: 'model-1' }, { id: 'model-2' }],
        }),
      );

      const result = await monitor.performHealthCheck('LMStudio', 'http://localhost:1234');

      expect(result.isHealthy).toBe(true);
      expect(result.availableModels).toEqual(['model-1', 'model-2']);
    });

    it('should normalize URL to include /v1 prefix', async () => {
      monitor.startMonitoring('LMStudio', 'http://localhost:1234');

      mockFetch.mockResolvedValueOnce(mockResponse({ data: [] }));

      await monitor.performHealthCheck('LMStudio', 'http://localhost:1234');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/v1/models');
    });

    it('should not double-add /v1 if already present', async () => {
      monitor.startMonitoring('LMStudio', 'http://localhost:1234/v1');

      mockFetch.mockResolvedValueOnce(mockResponse({ data: [] }));

      await monitor.performHealthCheck('LMStudio', 'http://localhost:1234/v1');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe('http://localhost:1234/v1/models');
    });

    it('should report CORS error when response is opaque', async () => {
      monitor.startMonitoring('LMStudio', 'http://localhost:1234');

      mockFetch.mockResolvedValueOnce(
        mockResponse({}, { ok: false, status: 0, type: 'opaque' }),
      );

      const result = await monitor.performHealthCheck('LMStudio', 'http://localhost:1234');
      expect(result.isHealthy).toBe(false);
      expect(result.error).toContain('CORS');
    });

    it('should detect CORS error from network failure message', async () => {
      monitor.startMonitoring('LMStudio', 'http://localhost:1234');

      mockFetch.mockRejectedValue(new Error('Failed to fetch'));

      const result = await monitor.performHealthCheck('LMStudio', 'http://localhost:1234');
      expect(result.isHealthy).toBe(false);
      expect(result.error).toContain('CORS');
    });
  });

  describe('performHealthCheck - OpenAILike', () => {
    it('should report healthy when OpenAI-like provider responds', async () => {
      monitor.startMonitoring('OpenAILike', 'http://localhost:8080');

      mockFetch.mockResolvedValueOnce(
        mockResponse({ data: [{ id: 'gpt-test' }] }),
      );

      const result = await monitor.performHealthCheck('OpenAILike', 'http://localhost:8080');
      expect(result.isHealthy).toBe(true);
      expect(result.availableModels).toEqual(['gpt-test']);
    });

    it('should normalize URL to include /v1', async () => {
      monitor.startMonitoring('OpenAILike', 'http://localhost:8080');

      mockFetch.mockResolvedValueOnce(mockResponse({ data: [] }));

      await monitor.performHealthCheck('OpenAILike', 'http://localhost:8080');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe('http://localhost:8080/v1/models');
    });

    it('should report unhealthy on HTTP error', async () => {
      monitor.startMonitoring('OpenAILike', 'http://localhost:8080');

      mockFetch.mockResolvedValueOnce(
        mockResponse({ message: 'Unauthorized' }, { ok: false, status: 401 }),
      );

      const result = await monitor.performHealthCheck('OpenAILike', 'http://localhost:8080');
      expect(result.isHealthy).toBe(false);
      expect(result.error).toContain('401');
    });
  });

  describe('event emitter', () => {
    it('should emit statusChanged when health check updates status', async () => {
      monitor.startMonitoring('Ollama', 'http://localhost:11434');

      const listener = vi.fn();
      monitor.on('statusChanged', listener);

      mockFetch.mockResolvedValueOnce(mockResponse({ models: [] }));

      await monitor.performHealthCheck('Ollama', 'http://localhost:11434');

      // Initial 'checking' event + final 'healthy' event
      expect(listener).toHaveBeenCalled();
      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0] as ModelHealthStatus;
      expect(lastCall.status).toBe('healthy');
    });

    it('should emit statusChanged with unhealthy on failure', async () => {
      monitor.startMonitoring('Ollama', 'http://localhost:11434');

      const listener = vi.fn();
      monitor.on('statusChanged', listener);

      mockFetch.mockRejectedValue(new Error('connection refused'));

      await monitor.performHealthCheck('Ollama', 'http://localhost:11434');

      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0] as ModelHealthStatus;
      expect(lastCall.status).toBe('unhealthy');
      expect(lastCall.error).toBe('connection refused');
    });

    it('should stop receiving events after off()', async () => {
      monitor.startMonitoring('Ollama', 'http://localhost:11434');

      const listener = vi.fn();
      monitor.on('statusChanged', listener);
      monitor.off('statusChanged', listener);

      mockFetch.mockResolvedValueOnce(mockResponse({ models: [] }));
      await monitor.performHealthCheck('Ollama', 'http://localhost:11434');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should clear all intervals, statuses, and listeners', () => {
      monitor.startMonitoring('Ollama', 'http://localhost:11434');
      monitor.startMonitoring('LMStudio', 'http://localhost:1234');

      const listener = vi.fn();
      monitor.on('statusChanged', listener);

      monitor.destroy();

      expect(monitor.getAllHealthStatuses()).toEqual([]);
      expect(monitor.getHealthStatus('Ollama', 'http://localhost:11434')).toBeUndefined();
    });
  });

  describe('periodic health checks via setInterval', () => {
    it('should perform periodic health checks at the given interval', async () => {
      mockFetch.mockResolvedValue(mockResponse({ models: [] }));

      monitor.startMonitoring('Ollama', 'http://localhost:11434', 5000);

      // Initial check runs immediately (async)
      await vi.advanceTimersByTimeAsync(10);

      // Advance to trigger the interval
      await vi.advanceTimersByTimeAsync(5000);

      // At least 2 fetch calls: initial + interval
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});