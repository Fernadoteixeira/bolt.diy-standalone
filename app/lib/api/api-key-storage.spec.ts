import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let apiKeyStorageModule: typeof import('./api-key-storage');

class MockCustomEvent {
  type: string;
  detail?: unknown;

  constructor(type: string, init?: { detail?: unknown }) {
    this.type = type;
    this.detail = init?.detail;
  }
}

describe('api-key-storage', () => {
  const storage = new Map<string, string>();
  const dispatchEventMock = vi.fn();

  const fakeWindow = {
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
    dispatchEvent: dispatchEventMock,
    document: {
      cookie: '',
    },
  };

  beforeEach(async () => {
    storage.clear();
    dispatchEventMock.mockClear();
    fakeWindow.document.cookie = '';

    const globalWithOverrides = globalThis as typeof globalThis & {
      window: any;
      document: any;
      CustomEvent: any;
    };
    globalWithOverrides.window = fakeWindow as any;
    globalWithOverrides.document = fakeWindow.document as any;
    globalWithOverrides.CustomEvent = MockCustomEvent as any;
    vi.resetModules();
    apiKeyStorageModule = await import('./api-key-storage');
  });

  afterEach(() => {
    const globalWithOverrides = globalThis as typeof globalThis & {
      window?: any;
      document?: any;
    };
    delete globalWithOverrides.window;
    delete globalWithOverrides.document;
  });

  it('persists api keys in session storage and dispatches an update event', () => {
    apiKeyStorageModule.saveApiKeysToStorage({ openai: 'abc123' });

    expect(apiKeyStorageModule.getApiKeysFromStorage()).toEqual({ openai: 'abc123' });
    expect(dispatchEventMock).toHaveBeenCalledTimes(1);
    expect(dispatchEventMock.mock.calls[0][0].type).toBe(apiKeyStorageModule.API_KEYS_STORAGE_EVENT);
  });

  it('clears stored api keys from session storage', () => {
    apiKeyStorageModule.saveApiKeysToStorage({ openai: 'abc123' });
    apiKeyStorageModule.clearApiKeysFromStorage();

    expect(apiKeyStorageModule.getApiKeysFromStorage()).toEqual({});
    expect(storage.has('bolt_api_keys')).toBe(false);
  });

  it('migrates legacy cookie values into session storage', () => {
    fakeWindow.document.cookie = 'apiKeys=%7B%22anthropic%22%3A%22legacy-key%22%7D';

    expect(apiKeyStorageModule.getApiKeysFromStorage()).toEqual({ anthropic: 'legacy-key' });
    expect(storage.get('bolt_api_keys')).toContain('anthropic');
    expect(fakeWindow.document.cookie).toContain('max-age=0');
  });
});
