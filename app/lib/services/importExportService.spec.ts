import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ------------------------------------------------------------------ *
 * Module mocks — hoisted by vitest before imports are resolved.
 * ------------------------------------------------------------------ */

vi.mock('js-cookie', () => ({
  default: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('~/lib/persistence/chats', () => ({
  getAllChats: vi.fn(),
  deleteChat: vi.fn(),
}));

vi.mock('~/lib/api/api-key-storage', () => ({
  getApiKeysFromStorage: vi.fn(),
  saveApiKeysToStorage: vi.fn(),
}));

import { ImportExportService } from './importExportService';
import Cookies from 'js-cookie';
import { getAllChats, deleteChat } from '~/lib/persistence/chats';
import { getApiKeysFromStorage, saveApiKeysToStorage } from '~/lib/api/api-key-storage';

/* ------------------------------------------------------------------ *
 * localStorage mock — methods are non-enumerable so Object.keys()
 * only returns data keys, matching real localStorage behaviour.
 * ------------------------------------------------------------------ */
function createLocalStorageMock(initial: Record<string, string> = {}) {
  const mock: Record<string, any> = {};

  for (const [k, v] of Object.entries(initial)) {
    mock[k] = v;
  }

  Object.defineProperties(mock, {
    getItem: {
      value: vi.fn((key: string) => mock[key] ?? null),
      enumerable: false,
      configurable: true,
      writable: true,
    },
    setItem: {
      value: vi.fn((key: string, value: string) => {
        mock[key] = value;
      }),
      enumerable: false,
      configurable: true,
      writable: true,
    },
    removeItem: {
      value: vi.fn((key: string) => {
        delete mock[key];
      }),
      enumerable: false,
      configurable: true,
      writable: true,
    },
    clear: {
      value: vi.fn(() => {
        for (const k of Object.keys(mock)) {
          delete mock[k];
        }
      }),
      enumerable: false,
      configurable: true,
      writable: true,
    },
    key: {
      value: vi.fn((i: number) => Object.keys(mock)[i] ?? null),
      enumerable: false,
      configurable: true,
      writable: true,
    },
    length: {
      get: () => Object.keys(mock).length,
      enumerable: false,
      configurable: true,
    },
  });

  return mock;
}

describe('ImportExportService', () => {
  let lsMock: Record<string, any>;

  beforeEach(() => {
    lsMock = createLocalStorageMock();
    vi.stubGlobal('localStorage', lsMock);

    vi.mocked(Cookies.get).mockReturnValue({});
    vi.mocked(Cookies.set).mockImplementation(() => ({} as any));
    vi.mocked(Cookies.remove).mockImplementation(() => ({} as any));
    vi.mocked(getApiKeysFromStorage).mockReturnValue({});
    vi.mocked(saveApiKeysToStorage).mockImplementation(() => ({} as any));
    vi.mocked(getAllChats).mockResolvedValue([]);
    vi.mocked(deleteChat).mockResolvedValue(undefined as any);

    vi.spyOn(console, 'log').mockImplementation(() => { /* no-op */ });
    vi.spyOn(console, 'error').mockImplementation(() => { /* no-op */ });
    vi.spyOn(console, 'warn').mockImplementation(() => { /* no-op */ });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /* -------------------------------------------------------------- *
   * exportAllChats
   * -------------------------------------------------------------- */
  describe('exportAllChats', () => {
    it('should throw when database is not initialized', async () => {
      await expect(ImportExportService.exportAllChats(null as any)).rejects.toThrow(
        'Database not initialized',
      );
    });

    it('should return sanitized chats with export date', async () => {
      const mockChats = [
        {
          id: 'chat-1',
          description: 'Test chat',
          messages: [
            { id: 'msg-1', role: 'user', content: 'Hello' },
            { id: 'msg-2', role: 'assistant', content: 'Hi there' },
          ],
          timestamp: '2024-01-01T00:00:00Z',
          urlId: 'url-1',
          metadata: { key: 'value' },
        },
      ];
      vi.mocked(getAllChats).mockResolvedValue(mockChats as any);

      const result = await ImportExportService.exportAllChats({} as IDBDatabase);

      expect(result.chats).toHaveLength(1);
      expect(result.chats[0]).toMatchObject({
        id: 'chat-1',
        description: 'Test chat',
        urlId: 'url-1',
        metadata: { key: 'value' },
      });
      expect(result.chats[0].messages).toHaveLength(2);
      expect(result.exportDate).toBeTruthy();
      expect(new Date(result.exportDate).getTime()).not.toBeNaN();
    });

    it('should sanitize messages to include only expected fields', async () => {
      const mockChats = [
        {
          id: 'chat-1',
          description: 'Test',
          messages: [
            {
              id: 'msg-1',
              role: 'user',
              content: 'Hello',
              name: 'user-name',
              function_call: { name: 'fn' },
              timestamp: 12345,
              extraField: 'should-not-appear',
            },
          ],
          timestamp: '2024-01-01T00:00:00Z',
        },
      ];
      vi.mocked(getAllChats).mockResolvedValue(mockChats as any);

      const result = await ImportExportService.exportAllChats({} as IDBDatabase);
      const msg = result.chats[0].messages[0] as any;

      expect(msg.id).toBe('msg-1');
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('Hello');
      expect(msg.name).toBe('user-name');
      expect(msg.function_call).toEqual({ name: 'fn' });
      expect(msg.timestamp).toBe(12345);
      expect(msg.extraField).toBeUndefined();
    });

    it('should handle empty chat list', async () => {
      vi.mocked(getAllChats).mockResolvedValue([]);

      const result = await ImportExportService.exportAllChats({} as IDBDatabase);
      expect(result.chats).toEqual([]);
    });

    it('should default missing optional fields', async () => {
      const mockChats = [
        {
          id: 'chat-1',
          messages: [{ id: 'm1', role: 'user', content: 'hi' }],
          timestamp: '2024-01-01T00:00:00Z',
        },
      ];
      vi.mocked(getAllChats).mockResolvedValue(mockChats as any);

      const result = await ImportExportService.exportAllChats({} as IDBDatabase);
      expect(result.chats[0].description).toBe('');
      expect(result.chats[0].urlId).toBeNull();
      expect(result.chats[0].metadata).toBeNull();
    });

    it('should throw a wrapped error when getAllChats fails', async () => {
      vi.mocked(getAllChats).mockRejectedValue(new Error('DB read failed'));

      await expect(ImportExportService.exportAllChats({} as IDBDatabase)).rejects.toThrow(
        'Failed to export chats: DB read failed',
      );
    });
  });

  /* -------------------------------------------------------------- *
   * exportSettings
   * -------------------------------------------------------------- */
  describe('exportSettings', () => {
    it('should return a comprehensive settings object with metadata', async () => {
      vi.mocked(Cookies.get).mockReturnValue({
        selectedModel: 'gpt-4',
        selectedProvider: 'OpenAI',
        providers: '{}',
      });

      const result = await ImportExportService.exportSettings();

      expect(result._meta).toBeDefined();
      expect(result._meta.version).toBe('2.0');
      expect(result._meta.exportDate).toBeTruthy();
      expect(result.core).toBeDefined();
      expect(result.providers).toBeDefined();
      expect(result.features).toBeDefined();
      expect(result.ui).toBeDefined();
      expect(result.connections).toBeDefined();
      expect(result.debug).toBeDefined();
      expect(result.updates).toBeDefined();
      expect(result._raw).toBeDefined();
    });

    it('should include API keys from storage', async () => {
      vi.mocked(getApiKeysFromStorage).mockReturnValue({ OpenAI: 'sk-test' });

      const result = await ImportExportService.exportSettings();
      expect(result.providers.apiKeys).toEqual({ OpenAI: 'sk-test' });
    });

    it('should include cookie-based settings', async () => {
      vi.mocked(Cookies.get).mockReturnValue({
        selectedModel: 'gpt-4',
        selectedProvider: 'OpenAI',
        tabConfiguration: 'tabs',
        isDebugEnabled: 'true',
        eventLogs: '[]',
      });

      const result = await ImportExportService.exportSettings();
      expect(result.providers.selectedModel).toBe('gpt-4');
      expect(result.ui.tabConfiguration).toBe('tabs');
      expect(result.debug.isDebugEnabled).toBe('true');
    });

    it('should include GitHub connections from localStorage', async () => {
      lsMock['github_token'] = JSON.stringify('ghp_123');
      lsMock['github_username'] = JSON.stringify('testuser');

      const result = await ImportExportService.exportSettings();
      expect(result.connections.github_token).toBe('ghp_123');
      expect(result.connections.github_username).toBe('testuser');
    });

    it('should include chat snapshots from localStorage', async () => {
      lsMock['snapshot:chat-1'] = JSON.stringify({ data: 'snapshot1' });

      const result = await ImportExportService.exportSettings();
      expect(result.chatSnapshots['snapshot:chat-1']).toEqual({ data: 'snapshot1' });
    });

    it('should include raw localStorage and cookies for debugging', async () => {
      lsMock['some-key'] = JSON.stringify('some-value');
      vi.mocked(Cookies.get).mockReturnValue({ someCookie: 'val' });

      const result = await ImportExportService.exportSettings();
      expect(result._raw.localStorage).toBeDefined();
      expect(result._raw.cookies).toEqual({ someCookie: 'val' });
    });
  });

  /* -------------------------------------------------------------- *
   * importSettings
   * -------------------------------------------------------------- */
  describe('importSettings', () => {
    it('should route to comprehensive format when _meta.version is 2.0', async () => {
      const data = {
        _meta: { version: '2.0', exportDate: '2024-01-01' },
        core: {
          bolt_user_profile: { name: 'test' },
        },
      };

      await ImportExportService.importSettings(data);

      // _safeSetItem JSON.stringifies the value before calling localStorage.setItem
      expect(lsMock.setItem).toHaveBeenCalledWith('bolt_user_profile', JSON.stringify({ name: 'test' }));
    });

    it('should import provider settings in comprehensive format', async () => {
      const data = {
        _meta: { version: '2.0' },
        providers: {
          provider_settings: { key: 'val' },
          selectedModel: 'gpt-4',
        },
      };

      await ImportExportService.importSettings(data);

      // provider_settings goes through _safeSetItem which JSON.stringifies the value
      expect(lsMock.setItem).toHaveBeenCalledWith('provider_settings', JSON.stringify({ key: 'val' }));
      expect(Cookies.set).toHaveBeenCalledWith('selectedModel', 'gpt-4', expect.any(Object));
    });

    it('should import feature settings in comprehensive format', async () => {
      const data = {
        _meta: { version: '2.0' },
        features: {
          developer_mode: 'true',
          contextOptimizationEnabled: 'false',
        },
      };

      await ImportExportService.importSettings(data);
      // _safeSetItem JSON.stringifies string values (e.g. 'true' → '"true"')
      expect(lsMock.setItem).toHaveBeenCalledWith('developer_mode', JSON.stringify('true'));
      expect(lsMock.setItem).toHaveBeenCalledWith('contextOptimizationEnabled', JSON.stringify('false'));
    });

    it('should import connections in comprehensive format', async () => {
      const data = {
        _meta: { version: '2.0' },
        connections: {
          netlify_connection: { token: 'abc' },
          github_token: 'ghp_xyz',
        },
      };

      await ImportExportService.importSettings(data);
      // _safeSetItem JSON.stringifies the values before calling localStorage.setItem
      expect(lsMock.setItem).toHaveBeenCalledWith('netlify_connection', JSON.stringify({ token: 'abc' }));
      expect(lsMock.setItem).toHaveBeenCalledWith('github_token', JSON.stringify('ghp_xyz'));
    });

    it('should import chat snapshots in comprehensive format', async () => {
      const data = {
        _meta: { version: '2.0' },
        chatSnapshots: {
          'snapshot:chat-1': { data: 'snap' },
        },
      };

      await ImportExportService.importSettings(data);
      // _safeSetItem JSON.stringifies the value before calling localStorage.setItem
      expect(lsMock.setItem).toHaveBeenCalledWith('snapshot:chat-1', JSON.stringify({ data: 'snap' }));
    });

    it('should skip null and undefined values in comprehensive format', async () => {
      const data = {
        _meta: { version: '2.0' },
        core: {
          bolt_user_profile: null,
          bolt_settings: undefined,
          theme: 'dark',
        },
      };

      await ImportExportService.importSettings(data);
      // Only 'theme' should be set; _safeSetItem JSON.stringifies 'dark' → '"dark"'
      expect(lsMock.setItem).toHaveBeenCalledTimes(1);
      expect(lsMock.setItem).toHaveBeenCalledWith('theme', JSON.stringify('dark'));
    });

    it('should route to legacy format when _meta.version is not 2.0', async () => {
      const data = {
        theme: 'dark',
        apiKeys: '{"OpenAI":"sk-test"}',
        exportDate: '2024-01-01',
      };

      await ImportExportService.importSettings(data);

      // 'theme' goes through _safeSetItem (JSON.stringify), 'apiKeys' goes to cookies as-is (string)
      expect(lsMock.setItem).toHaveBeenCalledWith('theme', JSON.stringify('dark'));
      expect(Cookies.set).toHaveBeenCalledWith('apiKeys', '{"OpenAI":"sk-test"}', expect.any(Object));
    });

    it('should skip metadata fields in legacy format', async () => {
      const data = {
        exportDate: '2024-01-01',
        version: '1.0',
        appVersion: '1.0.0',
        theme: 'dark',
      };

      await ImportExportService.importSettings(data);
      // Only 'theme' should be set (metadata fields are skipped); _safeSetItem JSON.stringifies 'dark'
      expect(lsMock.setItem).toHaveBeenCalledTimes(1);
      expect(lsMock.setItem).toHaveBeenCalledWith('theme', JSON.stringify('dark'));
    });

    it('should skip null and undefined values in legacy format', async () => {
      const data = {
        theme: null,
        selectedModel: undefined,
        provider_settings: '{}',
      };

      await ImportExportService.importSettings(data);
      // Only 'provider_settings' should be set; _safeSetItem JSON.stringifies '{}' → '"{}"'
      expect(lsMock.setItem).toHaveBeenCalledTimes(1);
      expect(lsMock.setItem).toHaveBeenCalledWith('provider_settings', JSON.stringify('{}'));
    });

    it('should handle empty import data', async () => {
      await expect(ImportExportService.importSettings({})).resolves.not.toThrow();
    });
  });

  /* -------------------------------------------------------------- *
   * importAPIKeys
   * -------------------------------------------------------------- */
  describe('importAPIKeys', () => {
    it('should merge imported keys with existing keys', () => {
      vi.mocked(getApiKeysFromStorage).mockReturnValue({ OpenAI: 'existing-key' });

      const result = ImportExportService.importAPIKeys({ Anthropic: 'new-key' });

      expect(result).toEqual({
        OpenAI: 'existing-key',
        Anthropic: 'new-key',
      });
      expect(saveApiKeysToStorage).toHaveBeenCalledWith(result);
    });

    it('should skip comment fields (keys starting with _)', () => {
      vi.mocked(getApiKeysFromStorage).mockReturnValue({});

      const result = ImportExportService.importAPIKeys({
        _comment: 'This is a comment',
        OpenAI: 'sk-test',
      });

      expect(result).toEqual({ OpenAI: 'sk-test' });
      expect(result._comment).toBeUndefined();
    });

    it('should skip base URL fields (_API_BASE_URL)', () => {
      vi.mocked(getApiKeysFromStorage).mockReturnValue({});

      const result = ImportExportService.importAPIKeys({
        OpenAI_API_BASE_URL: 'https://api.openai.com',
        OpenAI: 'sk-test',
      });

      expect(result).toEqual({ OpenAI: 'sk-test' });
      expect(result.OpenAI_API_BASE_URL).toBeUndefined();
    });

    it('should throw on non-string values', () => {
      vi.mocked(getApiKeysFromStorage).mockReturnValue({});

      expect(() => ImportExportService.importAPIKeys({ OpenAI: 123 as any })).toThrow(
        'Invalid value for key: OpenAI',
      );
    });

    it('should normalize old format keys (X_API_KEY → X)', () => {
      vi.mocked(getApiKeysFromStorage).mockReturnValue({});

      const result = ImportExportService.importAPIKeys({
        Anthropic_API_KEY: 'sk-ant-test',
        OpenAI_API_KEY: 'sk-openai-test',
      });

      expect(result.Anthropic).toBe('sk-ant-test');
      expect(result.OpenAI).toBe('sk-openai-test');
      expect(result.Anthropic_API_KEY).toBeUndefined();
    });

    it('should only add non-empty values', () => {
      vi.mocked(getApiKeysFromStorage).mockReturnValue({});

      const result = ImportExportService.importAPIKeys({
        OpenAI: '',
        Anthropic: 'sk-ant',
      });

      expect(result).toEqual({ Anthropic: 'sk-ant' });
      expect(result.OpenAI).toBeUndefined();
    });

    it('should preserve existing keys that are not overwritten', () => {
      vi.mocked(getApiKeysFromStorage).mockReturnValue({ Google: 'existing-google', OpenAI: 'existing-openai' });

      const result = ImportExportService.importAPIKeys({ OpenAI: 'new-openai' });

      expect(result.Google).toBe('existing-google');
      expect(result.OpenAI).toBe('new-openai');
    });
  });

  /* -------------------------------------------------------------- *
   * createAPIKeysTemplate
   * -------------------------------------------------------------- */
  describe('createAPIKeysTemplate', () => {
    it('should return a template with provider names as keys', () => {
      const template = ImportExportService.createAPIKeysTemplate();

      expect(template._comment).toBeDefined();
      expect(template._comment).toContain('Fill in your API keys');
      expect(template.Anthropic).toBe('');
      expect(template.OpenAI).toBe('');
      expect(template.Google).toBe('');
      expect(template.Groq).toBe('');
      expect(template.Deepseek).toBe('');
      expect(template.Mistral).toBe('');
    });

    it('should have all values as empty strings', () => {
      const template = ImportExportService.createAPIKeysTemplate();
      const providerKeys = Object.keys(template).filter((k) => !k.startsWith('_'));

      for (const key of providerKeys) {
        expect(template[key]).toBe('');
      }
    });
  });

  /* -------------------------------------------------------------- *
   * resetAllSettings
   * -------------------------------------------------------------- */
  describe('resetAllSettings', () => {
    it('should clear localStorage items', async () => {
      lsMock['theme'] = JSON.stringify('dark');
      lsMock['bolt_settings'] = JSON.stringify({ key: 'val' });
      lsMock['debug_mode'] = JSON.stringify('true');

      await ImportExportService.resetAllSettings({} as IDBDatabase);

      // debug_mode should be preserved, others removed
      expect(lsMock['theme']).toBeUndefined();
      expect(lsMock['bolt_settings']).toBeUndefined();
      expect(lsMock['debug_mode']).toBe(JSON.stringify('true'));
    });

    it('should clear all cookies', async () => {
      vi.mocked(Cookies.get).mockReturnValue({
        selectedModel: 'gpt-4',
        apiKeys: '{}',
      });

      await ImportExportService.resetAllSettings({} as IDBDatabase);

      expect(Cookies.remove).toHaveBeenCalledWith('selectedModel');
      expect(Cookies.remove).toHaveBeenCalledWith('apiKeys');
    });

    it('should delete all chats from IndexedDB', async () => {
      const mockChats = [
        { id: 'chat-1', messages: [], timestamp: '2024-01-01' },
        { id: 'chat-2', messages: [], timestamp: '2024-01-02' },
      ];
      vi.mocked(getAllChats).mockResolvedValue(mockChats as any);

      await ImportExportService.resetAllSettings({} as IDBDatabase);

      expect(deleteChat).toHaveBeenCalledTimes(2);
      expect(deleteChat).toHaveBeenCalledWith({} as IDBDatabase, 'chat-1');
      expect(deleteChat).toHaveBeenCalledWith({} as IDBDatabase, 'chat-2');
    });

    it('should skip IndexedDB reset when db is null', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* no-op */ });

      await ImportExportService.resetAllSettings(null as any);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Database not initialized'));
      expect(getAllChats).not.toHaveBeenCalled();
    });

    it('should clear chat snapshots from localStorage', async () => {
      lsMock['snapshot:chat-1'] = JSON.stringify({ data: 'snap' });
      lsMock['snapshot:chat-2'] = JSON.stringify({ data: 'snap2' });

      await ImportExportService.resetAllSettings({} as IDBDatabase);

      expect(lsMock['snapshot:chat-1']).toBeUndefined();
      expect(lsMock['snapshot:chat-2']).toBeUndefined();
    });
  });

  /* -------------------------------------------------------------- *
   * deleteAllChats
   * -------------------------------------------------------------- */
  describe('deleteAllChats', () => {
    it('should throw when database is not initialized', async () => {
      await expect(ImportExportService.deleteAllChats(null as any)).rejects.toThrow(
        'Database not initialized',
      );
    });

    it('should remove bolt_chat_history from localStorage', async () => {
      lsMock['bolt_chat_history'] = JSON.stringify([{ id: '1' }]);

      await ImportExportService.deleteAllChats({} as IDBDatabase);

      expect(lsMock.removeItem).toHaveBeenCalledWith('bolt_chat_history');
    });

    it('should delete all chats from IndexedDB', async () => {
      const mockChats = [
        { id: 'chat-1', messages: [], timestamp: '2024-01-01' },
        { id: 'chat-2', messages: [], timestamp: '2024-01-02' },
        { id: 'chat-3', messages: [], timestamp: '2024-01-03' },
      ];
      vi.mocked(getAllChats).mockResolvedValue(mockChats as any);

      await ImportExportService.deleteAllChats({} as IDBDatabase);

      expect(deleteChat).toHaveBeenCalledTimes(3);
    });

    it('should handle empty chat list', async () => {
      vi.mocked(getAllChats).mockResolvedValue([]);

      await ImportExportService.deleteAllChats({} as IDBDatabase);
      expect(deleteChat).not.toHaveBeenCalled();
    });
  });
});