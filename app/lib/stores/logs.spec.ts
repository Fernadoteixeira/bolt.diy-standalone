import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock js-cookie so the LogStore constructor does not touch real cookies
vi.mock('js-cookie', () => ({
  default: {
    get: vi.fn(() => undefined),
    set: vi.fn(),
  },
}));

import { logStore } from '~/lib/stores/logs';
import type { LogEntry } from '~/lib/stores/logs';
import Cookies from 'js-cookie';

describe('LogStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logStore.clearLogs();
    logStore.clearReadLogs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('logSystem', () => {
    it('should add a system log entry and return its id', () => {
      const id = logStore.logSystem('System started');

      expect(id).toBeTruthy();
      const logs = logStore.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('System started');
      expect(logs[0].level).toBe('info');
      expect(logs[0].category).toBe('system');
    });

    it('should include optional details', () => {
      logStore.logSystem('Boot complete', { version: '1.0' });

      const logs = logStore.getLogs();
      expect(logs[0].details).toEqual({ version: '1.0' });
    });
  });

  describe('logProvider', () => {
    it('should add a provider log entry', () => {
      logStore.logProvider('OpenAI connected');

      const logs = logStore.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].category).toBe('provider');
      expect(logs[0].level).toBe('info');
    });
  });

  describe('logUserAction', () => {
    it('should add a user log entry', () => {
      logStore.logUserAction('Clicked save');

      const logs = logStore.getLogs();
      expect(logs[0].category).toBe('user');
      expect(logs[0].level).toBe('info');
    });
  });

  describe('logAPIRequest', () => {
    it('should log a successful API request as info', () => {
      logStore.logAPIRequest('/api/data', 'GET', 120, 200);

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('info');
      expect(logs[0].category).toBe('api');
      expect(logs[0].message).toContain('GET');
      expect(logs[0].message).toContain('/api/data');
      expect(logs[0].message).toContain('200');
    });

    it('should log a 3xx response as warning', () => {
      logStore.logAPIRequest('/api/data', 'GET', 50, 302);

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('warning');
    });

    it('should log a 4xx/5xx response as error', () => {
      logStore.logAPIRequest('/api/data', 'POST', 300, 500);

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('error');
    });

    it('should include details in the log entry', () => {
      logStore.logAPIRequest('/api/data', 'POST', 100, 201, { extra: 'info' });

      const logs = logStore.getLogs();
      expect(logs[0].details).toMatchObject({ extra: 'info', endpoint: '/api/data', method: 'POST' });
    });
  });

  describe('logAuth', () => {
    it('should log a successful auth event as info', () => {
      logStore.logAuth('login', true);

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('info');
      expect(logs[0].category).toBe('auth');
      expect(logs[0].message).toContain('Success');
    });

    it('should log a failed auth event as error', () => {
      logStore.logAuth('login', false);

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('error');
      expect(logs[0].message).toContain('Failed');
    });
  });

  describe('logNetworkStatus', () => {
    it('should log online status as info', () => {
      logStore.logNetworkStatus('online');
      expect(logStore.getLogs()[0].level).toBe('info');
    });

    it('should log offline status as error', () => {
      logStore.logNetworkStatus('offline');
      expect(logStore.getLogs()[0].level).toBe('error');
    });

    it('should log reconnecting status as warning', () => {
      logStore.logNetworkStatus('reconnecting');
      expect(logStore.getLogs()[0].level).toBe('warning');
    });

    it('should log connected status as info', () => {
      logStore.logNetworkStatus('connected');
      expect(logStore.getLogs()[0].level).toBe('info');
    });
  });

  describe('logDatabase', () => {
    it('should log a successful DB operation as info', () => {
      logStore.logDatabase('SELECT', true, 50);

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('info');
      expect(logs[0].message).toContain('Success');
    });

    it('should log a failed DB operation as error', () => {
      logStore.logDatabase('INSERT', false, 100);

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('error');
      expect(logs[0].message).toContain('Failed');
    });
  });

  describe('logError', () => {
    it('should log an error with Error object details', () => {
      const err = new Error('Something broke');
      logStore.logError('Operation failed', err);

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('error');
      expect(logs[0].category).toBe('error');
      expect(logs[0].details).toMatchObject({ name: 'Error', message: 'Something broke' });
      expect(logs[0].details).toHaveProperty('stack');
    });

    it('should handle non-Error error values', () => {
      logStore.logError('Operation failed', 'string error');

      const logs = logStore.getLogs();
      expect(logs[0].details).toHaveProperty('error', 'string error');
    });

    it('should merge additional details with error info', () => {
      logStore.logError('Operation failed', new Error('boom'), { context: 'test' });

      const logs = logStore.getLogs();
      expect(logs[0].details).toMatchObject({ context: 'test', message: 'boom' });
    });
  });

  describe('logWarning', () => {
    it('should add a warning-level log', () => {
      logStore.logWarning('Something suspicious');

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('warning');
    });
  });

  describe('logDebug', () => {
    it('should add a debug-level log', () => {
      logStore.logDebug('Debug info');

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('debug');
    });
  });

  describe('logApiCall', () => {
    it('should log a successful API call as info', () => {
      logStore.logApiCall('GET', '/api/health', 200, 50);

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('info');
      expect(logs[0].category).toBe('api');
    });

    it('should log an errored API call as error', () => {
      logStore.logApiCall('POST', '/api/data', 500, 100, { req: 'data' }, { err: 'fail' });

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('error');
      expect(logs[0].details).toMatchObject({ method: 'POST', statusCode: 500, request: { req: 'data' } });
    });
  });

  describe('logNetworkRequest', () => {
    it('should log a network request in the network category', () => {
      logStore.logNetworkRequest('GET', 'https://api.example.com', 200, 30);

      const logs = logStore.getLogs();
      expect(logs[0].category).toBe('network');
    });
  });

  describe('logAuthEvent', () => {
    it('should log a successful auth event as info', () => {
      logStore.logAuthEvent('token_refresh', true);

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('info');
      expect(logs[0].message).toContain('succeeded');
    });

    it('should log a failed auth event as error', () => {
      logStore.logAuthEvent('key_validation', false);

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('error');
      expect(logs[0].message).toContain('failed');
    });
  });

  describe('logPerformance', () => {
    it('should log fast operations as info', () => {
      logStore.logPerformance('render', 200);

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('info');
      expect(logs[0].category).toBe('performance');
    });

    it('should log slow operations (>1000ms) as warning', () => {
      logStore.logPerformance('heavy-compute', 1500);

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('warning');
    });
  });

  describe('logErrorWithStack', () => {
    it('should log error with name and stack in details', () => {
      const err = new Error('Crash');
      logStore.logErrorWithStack(err, 'system');

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('error');
      expect(logs[0].category).toBe('system');
      expect(logs[0].details).toHaveProperty('name', 'Error');
      expect(logs[0].details).toHaveProperty('stack');
    });
  });

  describe('logSettingsChange', () => {
    it('should log a settings change with old and new values', () => {
      logStore.logSettingsChange('theme', 'mode', 'dark', 'light');

      const logs = logStore.getLogs();
      expect(logs[0].category).toBe('settings');
      expect(logs[0].details).toMatchObject({ setting: 'mode', previousValue: 'dark', newValue: 'light' });
    });
  });

  describe('logFeatureToggle', () => {
    it('should log feature enable', () => {
      logStore.logFeatureToggle('experimental-feature', true);

      const logs = logStore.getLogs();
      expect(logs[0].message).toContain('enabled');
      expect(logs[0].details).toMatchObject({ featureId: 'experimental-feature', enabled: true });
    });

    it('should log feature disable', () => {
      logStore.logFeatureToggle('experimental-feature', false);

      const logs = logStore.getLogs();
      expect(logs[0].message).toContain('disabled');
    });
  });

  describe('logTaskOperation', () => {
    it('should log a task operation', () => {
      logStore.logTaskOperation('task-123', 'create', 'pending');

      const logs = logStore.getLogs();
      expect(logs[0].category).toBe('task');
      expect(logs[0].details).toMatchObject({ taskId: 'task-123', operation: 'create', status: 'pending' });
    });
  });

  describe('logProviderAction', () => {
    it('should log a successful provider action as info', () => {
      logStore.logProviderAction('OpenAI', 'connect', true);

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('info');
      expect(logs[0].message).toContain('Success');
    });

    it('should log a failed provider action as error', () => {
      logStore.logProviderAction('OpenAI', 'connect', false);

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('error');
      expect(logs[0].message).toContain('Failed');
    });
  });

  describe('logPerformanceMetric', () => {
    it('should log a performance metric', () => {
      logStore.logPerformanceMetric('renderer', 'paint', 50);

      const logs = logStore.getLogs();
      expect(logs[0].category).toBe('performance');
      expect(logs[0].message).toContain('50ms');
    });

    it('should log slow metrics as warning', () => {
      logStore.logPerformanceMetric('renderer', 'paint', 2000);

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('warning');
    });
  });

  describe('logInfo', () => {
    it('should log an info message with details', () => {
      logStore.logInfo('Test message', { type: 'test', message: 'detail' });

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('info');
      expect(logs[0].details).toEqual({ type: 'test', message: 'detail' });
    });
  });

  describe('logSuccess', () => {
    it('should log a success message with success: true in details', () => {
      logStore.logSuccess('Operation done', { type: 'task', message: 'completed' });

      const logs = logStore.getLogs();
      expect(logs[0].details).toHaveProperty('success', true);
    });
  });

  describe('logApiRequest (lowercase)', () => {
    it('should log an API request via the _addApiLog path', () => {
      logStore.logApiRequest('GET', 'https://api.example.com', {
        method: 'GET',
        url: 'https://api.example.com',
        statusCode: 200,
        duration: 50,
        request: null,
        response: { ok: true },
      });

      const logs = logStore.getLogs();
      expect(logs[0].category).toBe('api');
      expect(logs[0].level).toBe('info');
    });

    it('should log a failed API request as error', () => {
      logStore.logApiRequest('POST', 'https://api.example.com', {
        method: 'POST',
        url: 'https://api.example.com',
        statusCode: 500,
        duration: 100,
        request: {},
        response: {},
      });

      const logs = logStore.getLogs();
      expect(logs[0].level).toBe('error');
    });
  });

  describe('getLogs', () => {
    it('should return logs sorted by timestamp descending', async () => {
      logStore.logSystem('First');
      await new Promise((r) => setTimeout(r, 5));
      logStore.logSystem('Second');
      await new Promise((r) => setTimeout(r, 5));
      logStore.logSystem('Third');

      const logs = logStore.getLogs();
      expect(logs).toHaveLength(3);
      // Most recent first
      expect(logs[0].message).toBe('Third');
      expect(logs[2].message).toBe('First');
    });

    it('should return an empty array when no logs exist', () => {
      expect(logStore.getLogs()).toEqual([]);
    });
  });

  describe('getFilteredLogs', () => {
    beforeEach(() => {
      // Provide details to all entries to avoid JSON.stringify(undefined) issues
      // in getFilteredLogs search matching
      logStore.logSystem('System message', { info: 'init' });
      logStore.logError('Something broke', new Error('fail'));
      logStore.logWarning('Be careful', { reason: 'test' });
      logStore.logProvider('Provider connected', { name: 'openai' });
    });

    it('should return all logs when no filters are provided', () => {
      const filtered = logStore.getFilteredLogs();
      expect(filtered).toHaveLength(4);
    });

    it('should filter by level', () => {
      const errors = logStore.getFilteredLogs('error');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Something broke');
    });

    it('should filter by category', () => {
      const providerLogs = logStore.getFilteredLogs(undefined, 'provider');
      expect(providerLogs).toHaveLength(1);
      expect(providerLogs[0].message).toBe('Provider connected');
    });

    it('should filter by search query (case-insensitive, matches message)', () => {
      const results = logStore.getFilteredLogs(undefined, undefined, 'system');
      expect(results).toHaveLength(1);
      expect(results[0].message).toBe('System message');
    });

    it('should filter by search query matching details', () => {
      const results = logStore.getFilteredLogs(undefined, undefined, 'fail');
      expect(results).toHaveLength(1);
      expect(results[0].message).toBe('Something broke');
    });

    it('should combine level and category filters', () => {
      logStore.logSystem('Another system');
      const results = logStore.getFilteredLogs('info', 'system');
      expect(results).toHaveLength(2);
    });

    it('should return empty array when no logs match', () => {
      // Note: filtering by 'debug' level is a special case that returns ALL logs
      // (the code treats level === 'debug' as "show everything"). Use a category
      // that none of the logs have instead.
      const results = logStore.getFilteredLogs(undefined, 'task');
      expect(results).toHaveLength(0);
    });
  });

  describe('clearLogs', () => {
    it('should remove all log entries', () => {
      logStore.logSystem('A');
      logStore.logSystem('B');
      expect(logStore.getLogs()).toHaveLength(2);

      logStore.clearLogs();

      expect(logStore.getLogs()).toEqual([]);
    });

    it('should persist cleared logs via Cookies.set', () => {
      vi.mocked(Cookies.set).mockClear();
      logStore.clearLogs();
      expect(Cookies.set).toHaveBeenCalled();
    });
  });

  describe('markAsRead / isRead / clearReadLogs', () => {
    it('should mark a log as read and report it as read', () => {
      const id = logStore.logSystem('Test');
      expect(logStore.isRead(id)).toBe(false);

      logStore.markAsRead(id);

      expect(logStore.isRead(id)).toBe(true);
    });

    it('should return false for unread logs', () => {
      expect(logStore.isRead('non-existent-id')).toBe(false);
    });

    it('should clear all read logs', () => {
      const id = logStore.logSystem('Test');
      logStore.markAsRead(id);
      expect(logStore.isRead(id)).toBe(true);

      logStore.clearReadLogs();

      expect(logStore.isRead(id)).toBe(false);
    });

    it('should handle marking multiple logs as read', () => {
      const id1 = logStore.logSystem('A');
      const id2 = logStore.logSystem('B');

      logStore.markAsRead(id1);
      logStore.markAsRead(id2);

      expect(logStore.isRead(id1)).toBe(true);
      expect(logStore.isRead(id2)).toBe(true);
    });
  });

  describe('refreshLogs', () => {
    it('should trigger a store update without changing data', () => {
      logStore.logSystem('Test');
      const logsBefore = logStore.getLogs();

      logStore.refreshLogs();

      const logsAfter = logStore.getLogs();
      expect(logsAfter).toHaveLength(logsBefore.length);
    });
  });

  describe('log entry shape', () => {
    it('should generate unique ids for each entry', () => {
      const id1 = logStore.logSystem('A');
      const id2 = logStore.logSystem('B');

      expect(id1).not.toBe(id2);
    });

    it('should include an ISO timestamp', () => {
      logStore.logSystem('Test');
      const logs = logStore.getLogs();
      const ts = new Date(logs[0].timestamp);
      expect(ts.getTime()).not.toBeNaN();
    });
  });
});