import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock js-cookie so the transitive logs module does not touch real cookies
vi.mock('js-cookie', () => ({
  default: {
    get: vi.fn(() => undefined),
    set: vi.fn(),
  },
}));

/**
 * Helper: create a minimal localStorage mock.
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
    _store: store,
  };
}

/**
 * Helper: create a minimal document mock with querySelector support.
 */
function createDocumentMock(theme: string | null = null) {
  const htmlEl = {
    getAttribute: vi.fn((_name: string) => theme),
    setAttribute: vi.fn(),
  };

  return {
    querySelector: vi.fn(() => htmlEl),
    _htmlEl: htmlEl,
  };
}

describe('Theme Store', () => {
  let themeStore: any;
  let themeIsDark: any;
  let toggleTheme: any;
  let ls: ReturnType<typeof createLocalStorageMock>;
  let doc: ReturnType<typeof createDocumentMock>;

  beforeEach(async () => {
    vi.resetModules();
    // import.meta.env.SSR is true in vitest's node environment; stub it to false
    // so initStore() reads from localStorage / data-theme attribute
    vi.stubEnv('SSR', false as any);
    ls = createLocalStorageMock();
    doc = createDocumentMock(null);

    vi.stubGlobal('window', { localStorage: ls });
    vi.stubGlobal('localStorage', ls);
    vi.stubGlobal('document', doc);

    const mod = await import('~/lib/stores/theme');
    themeStore = mod.themeStore;
    themeIsDark = mod.themeIsDark;
    toggleTheme = mod.toggleTheme;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should default to light theme when no persisted value and no data-theme attribute', async () => {
      expect(themeStore.get()).toBe('light');
    });

    it('should use persisted theme from localStorage when available', async () => {
      vi.resetModules();
      ls = createLocalStorageMock({ bolt_theme: 'dark' });
      vi.stubGlobal('window', { localStorage: ls });
      vi.stubGlobal('localStorage', ls);
      vi.stubGlobal('document', createDocumentMock(null));

      const mod = await import('~/lib/stores/theme');
      expect(mod.themeStore.get()).toBe('dark');
    });

    it('should fall back to data-theme attribute when no persisted theme', async () => {
      vi.resetModules();
      ls = createLocalStorageMock();
      vi.stubGlobal('window', { localStorage: ls });
      vi.stubGlobal('localStorage', ls);
      vi.stubGlobal('document', createDocumentMock('dark'));

      const mod = await import('~/lib/stores/theme');
      expect(mod.themeStore.get()).toBe('dark');
    });

    it('should prefer persisted theme over data-theme attribute', async () => {
      vi.resetModules();
      ls = createLocalStorageMock({ bolt_theme: 'light' });
      vi.stubGlobal('window', { localStorage: ls });
      vi.stubGlobal('localStorage', ls);
      vi.stubGlobal('document', createDocumentMock('dark'));

      const mod = await import('~/lib/stores/theme');
      expect(mod.themeStore.get()).toBe('light');
    });
  });

  describe('themeIsDark', () => {
    it('should return true when theme is dark', () => {
      themeStore.set('dark');
      expect(themeIsDark()).toBe(true);
    });

    it('should return false when theme is light', () => {
      themeStore.set('light');
      expect(themeIsDark()).toBe(false);
    });
  });

  describe('toggleTheme', () => {
    it('should switch from light to dark', () => {
      themeStore.set('light');

      toggleTheme();

      expect(themeStore.get()).toBe('dark');
    });

    it('should switch from dark to light', () => {
      themeStore.set('dark');

      toggleTheme();

      expect(themeStore.get()).toBe('light');
    });

    it('should persist the new theme to localStorage', () => {
      themeStore.set('light');
      ls.setItem.mockClear();

      toggleTheme();

      expect(ls.setItem).toHaveBeenCalledWith('bolt_theme', 'dark');
    });

    it('should update the HTML data-theme attribute', () => {
      themeStore.set('light');

      toggleTheme();

      expect(doc._htmlEl.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    });

    it('should update user profile theme if profile exists', () => {
      ls._store.set('bolt_user_profile', JSON.stringify({ username: 'test', theme: 'light' }));

      toggleTheme();

      const updated = JSON.parse(ls._store.get('bolt_user_profile')!);
      expect(updated.theme).toBe('dark');
    });

    it('should not crash when user profile JSON is invalid', () => {
      ls._store.set('bolt_user_profile', '{invalid json');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* no-op */ });

      expect(() => toggleTheme()).not.toThrow();

      errorSpy.mockRestore();
    });

    it('should not modify user profile when no profile is stored', () => {
      toggleTheme();

      expect(ls._store.has('bolt_user_profile')).toBe(false);
    });

    it('should handle toggling back and forth', () => {
      themeStore.set('light');

      toggleTheme();
      expect(themeStore.get()).toBe('dark');

      toggleTheme();
      expect(themeStore.get()).toBe('light');

      toggleTheme();
      expect(themeStore.get()).toBe('dark');
    });
  });
});