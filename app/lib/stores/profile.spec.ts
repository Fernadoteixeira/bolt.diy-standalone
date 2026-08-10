import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

describe('Profile Store', () => {
  let profileStore: any;
  let updateProfile: any;
  let ls: ReturnType<typeof createLocalStorageMock>;

  beforeEach(async () => {
    vi.resetModules();
    ls = createLocalStorageMock();
    vi.stubGlobal('window', { localStorage: ls });
    vi.stubGlobal('localStorage', ls);

    const mod = await import('~/lib/stores/profile');
    profileStore = mod.profileStore;
    updateProfile = mod.updateProfile;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should default to empty profile when nothing is stored', () => {
      const profile = profileStore.get();
      expect(profile).toEqual({ username: '', bio: '', avatar: '' });
    });

    it('should load a stored profile from localStorage', async () => {
      vi.resetModules();
      const stored = { username: 'testuser', bio: 'Test bio', avatar: 'data:image/png;base64,abc' };
      ls = createLocalStorageMock({ bolt_profile: JSON.stringify(stored) });
      vi.stubGlobal('window', { localStorage: ls });
      vi.stubGlobal('localStorage', ls);

      const mod = await import('~/lib/stores/profile');
      expect(mod.profileStore.get()).toEqual(stored);
    });

    it('should handle corrupt localStorage data gracefully', async () => {
      vi.resetModules();
      ls = createLocalStorageMock({ bolt_profile: '{invalid json' });
      vi.stubGlobal('window', { localStorage: ls });
      vi.stubGlobal('localStorage', ls);

      // The module uses JSON.parse at load time without try/catch,
      // so corrupt data will throw. This test documents that behavior.
      await expect(import('~/lib/stores/profile')).rejects.toThrow();
    });
  });

  describe('updateProfile', () => {
    it('should update a single field', () => {
      updateProfile({ username: 'newuser' });

      const profile = profileStore.get();
      expect(profile.username).toBe('newuser');
      // Other fields should be preserved
      expect(profile.bio).toBe('');
      expect(profile.avatar).toBe('');
    });

    it('should update multiple fields at once', () => {
      updateProfile({ username: 'newuser', bio: 'New bio', avatar: 'new-avatar' });

      const profile = profileStore.get();
      expect(profile).toEqual({ username: 'newuser', bio: 'New bio', avatar: 'new-avatar' });
    });

    it('should merge with existing profile data', () => {
      updateProfile({ username: 'user1', bio: 'bio1' });
      updateProfile({ avatar: 'avatar1' });

      const profile = profileStore.get();
      expect(profile).toEqual({ username: 'user1', bio: 'bio1', avatar: 'avatar1' });
    });

    it('should persist the updated profile to localStorage', () => {
      updateProfile({ username: 'persisted-user' });

      const stored = JSON.parse(ls._store.get('bolt_profile')!);
      expect(stored.username).toBe('persisted-user');
    });

    it('should handle empty updates (no-op merge)', () => {
      updateProfile({});
      expect(profileStore.get()).toEqual({ username: '', bio: '', avatar: '' });
    });

    it('should not lose existing fields when updating with partial data', () => {
      updateProfile({ username: 'user', bio: 'bio', avatar: 'av' });
      updateProfile({ bio: 'updated bio' });

      const profile = profileStore.get();
      expect(profile.username).toBe('user');
      expect(profile.bio).toBe('updated bio');
      expect(profile.avatar).toBe('av');
    });
  });

  describe('store subscriptions', () => {
    it('should notify subscribers when the profile changes', () => {
      const subscriber = vi.fn();
      const unsubscribe = profileStore.subscribe(subscriber);

      updateProfile({ username: 'test' });

      expect(subscriber).toHaveBeenCalled();
      unsubscribe();
    });

    it('should stop notifying after unsubscribe', () => {
      const subscriber = vi.fn();
      const unsubscribe = profileStore.subscribe(subscriber);

      // nanostores calls subscriber immediately with the current value on subscribe
      subscriber.mockClear();

      unsubscribe();
      updateProfile({ username: 'test' });

      expect(subscriber).not.toHaveBeenCalled();
    });
  });
});