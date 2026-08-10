import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Helper: create a minimal localStorage mock backed by a Map.
 */
function createLocalStorageMock(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => store.clear()),
    key: vi.fn((i: number) => Array.from(store.keys())[i] ?? null),
    get length() {
      return store.size;
    },
    _store: store,
  };
}

describe('localStorage persistence utilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('getLocalStorage', () => {
    it('should return null when not in a client environment', async () => {
      const { getLocalStorage } = await import('~/lib/persistence/localStorage');
      expect(getLocalStorage('any-key')).toBeNull();
    });

    it('should return null for a missing key', async () => {
      const ls = createLocalStorageMock();
      vi.stubGlobal('window', { localStorage: ls });
      vi.stubGlobal('localStorage', ls);

      const { getLocalStorage } = await import('~/lib/persistence/localStorage');
      expect(getLocalStorage('missing')).toBeNull();
    });

    it('should return the parsed JSON value for an existing key', async () => {
      const ls = createLocalStorageMock({ 'my-key': JSON.stringify({ foo: 'bar', n: 42 }) });
      vi.stubGlobal('window', { localStorage: ls });
      vi.stubGlobal('localStorage', ls);

      const { getLocalStorage } = await import('~/lib/persistence/localStorage');
      expect(getLocalStorage('my-key')).toEqual({ foo: 'bar', n: 42 });
    });

    it('should return primitive values parsed from JSON', async () => {
      const ls = createLocalStorageMock({ 'num': JSON.stringify(123), 'str': JSON.stringify('hello'), 'bool': JSON.stringify(true) });
      vi.stubGlobal('window', { localStorage: ls });
      vi.stubGlobal('localStorage', ls);

      const { getLocalStorage } = await import('~/lib/persistence/localStorage');
      expect(getLocalStorage('num')).toBe(123);
      expect(getLocalStorage('str')).toBe('hello');
      expect(getLocalStorage('bool')).toBe(true);
    });

    it('should return null and log an error when JSON parsing fails', async () => {
      const ls = createLocalStorageMock({ 'bad': '{not valid json' });
      vi.stubGlobal('window', { localStorage: ls });
      vi.stubGlobal('localStorage', ls);

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* no-op */ });

      const { getLocalStorage } = await import('~/lib/persistence/localStorage');
      expect(getLocalStorage('bad')).toBeNull();
      expect(errorSpy).toHaveBeenCalledOnce();
    });

    it('should call localStorage.getItem with the given key', async () => {
      const ls = createLocalStorageMock({ 'key': JSON.stringify('value') });
      vi.stubGlobal('window', { localStorage: ls });
      vi.stubGlobal('localStorage', ls);

      const { getLocalStorage } = await import('~/lib/persistence/localStorage');
      getLocalStorage('key');
      expect(ls.getItem).toHaveBeenCalledWith('key');
    });
  });

  describe('setLocalStorage', () => {
    it('should be a no-op when not in a client environment', async () => {
      const { setLocalStorage } = await import('~/lib/persistence/localStorage');
      expect(() => setLocalStorage('key', { foo: 'bar' })).not.toThrow();
    });

    it('should store a JSON-serialised value', async () => {
      const ls = createLocalStorageMock();
      vi.stubGlobal('window', { localStorage: ls });
      vi.stubGlobal('localStorage', ls);

      const { setLocalStorage } = await import('~/lib/persistence/localStorage');
      setLocalStorage('my-key', { foo: 'bar' });

      expect(ls.setItem).toHaveBeenCalledWith('my-key', JSON.stringify({ foo: 'bar' }));
      expect(ls._store.get('my-key')).toBe(JSON.stringify({ foo: 'bar' }));
    });

    it('should store primitive values', async () => {
      const ls = createLocalStorageMock();
      vi.stubGlobal('window', { localStorage: ls });
      vi.stubGlobal('localStorage', ls);

      const { setLocalStorage } = await import('~/lib/persistence/localStorage');
      setLocalStorage('num', 42);
      setLocalStorage('str', 'hello');

      expect(ls._store.get('num')).toBe('42');
      expect(ls._store.get('str')).toBe('"hello"');
    });

    it('should store null and undefined values', async () => {
      const ls = createLocalStorageMock();
      vi.stubGlobal('window', { localStorage: ls });
      vi.stubGlobal('localStorage', ls);

      const { setLocalStorage } = await import('~/lib/persistence/localStorage');
      setLocalStorage('null-val', null);
      setLocalStorage('undef-val', undefined);

      expect(ls._store.get('null-val')).toBe('null');
      // JSON.stringify(undefined) === undefined, but setItem will coerce
      expect(ls.setItem).toHaveBeenCalledWith('undef-val', undefined as any);
    });

    it('should log an error but not throw when setItem fails', async () => {
      const ls = createLocalStorageMock();
      ls.setItem = vi.fn(() => {
        throw new Error('Quota exceeded');
      });
      vi.stubGlobal('window', { localStorage: ls });
      vi.stubGlobal('localStorage', ls);

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* no-op */ });

      const { setLocalStorage } = await import('~/lib/persistence/localStorage');
      expect(() => setLocalStorage('key', { data: 'value' })).not.toThrow();
      expect(errorSpy).toHaveBeenCalledOnce();
    });

    it('should overwrite existing values for the same key', async () => {
      const ls = createLocalStorageMock({ 'key': JSON.stringify({ old: true }) });
      vi.stubGlobal('window', { localStorage: ls });
      vi.stubGlobal('localStorage', ls);

      const { setLocalStorage, getLocalStorage } = await import('~/lib/persistence/localStorage');
      setLocalStorage('key', { new: true });
      expect(getLocalStorage('key')).toEqual({ new: true });
    });
  });

  describe('round-trip', () => {
    it('should read back what was written', async () => {
      const ls = createLocalStorageMock();
      vi.stubGlobal('window', { localStorage: ls });
      vi.stubGlobal('localStorage', ls);

      const { getLocalStorage, setLocalStorage } = await import('~/lib/persistence/localStorage');

      const data = { name: 'bolt', items: [1, 2, 3], nested: { a: 'b' } };
      setLocalStorage('round-trip', data);
      expect(getLocalStorage('round-trip')).toEqual(data);
    });
  });
});