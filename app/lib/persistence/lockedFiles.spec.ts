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
    _store: store,
  };
}

describe('Locked Files Persistence', () => {
  let ls: ReturnType<typeof createLocalStorageMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    ls = createLocalStorageMock();
    vi.stubGlobal('window', { localStorage: ls, addEventListener: vi.fn() });
    vi.stubGlobal('localStorage', ls);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Import dynamically so we can reset module state with the correct globals
  async function importLockedFiles() {
    vi.resetModules();
    return await import('~/lib/persistence/lockedFiles');
  }

  describe('getLockedItems / initialization', () => {
    it('should return empty array when no locks are stored', async () => {
      const mod = await importLockedFiles();
      expect(mod.getLockedItems()).toEqual([]);
    });

    it('should load items from localStorage on first access', async () => {
      const stored = [
        { chatId: 'chat-1', path: 'src/index.ts', isFolder: false },
        { chatId: 'chat-1', path: 'src/utils', isFolder: true },
      ];
      ls._store.set('bolt.lockedFiles', JSON.stringify(stored));

      const mod = await importLockedFiles();
      const items = mod.getLockedItems();
      expect(items).toHaveLength(2);
      expect(items[0].path).toBe('src/index.ts');
      expect(items[1].path).toBe('src/utils');
      expect(items[1].isFolder).toBe(true);
    });

    it('should handle legacy items without isFolder property', async () => {
      // Legacy format: items without isFolder
      const legacy = [{ chatId: 'chat-1', path: 'old.ts' }];
      ls._store.set('bolt.lockedFiles', JSON.stringify(legacy));

      const mod = await importLockedFiles();
      const items = mod.getLockedItems();
      expect(items).toHaveLength(1);
      expect(items[0].isFolder).toBe(false);
    });

    it('should handle corrupt localStorage data gracefully', async () => {
      ls._store.set('bolt.lockedFiles', '{invalid json');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* no-op */ });

      const mod = await importLockedFiles();
      expect(mod.getLockedItems()).toEqual([]);
      errorSpy.mockRestore();
    });
  });

  describe('addLockedFile / addLockedFolder', () => {
    it('should add a locked file', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'src/index.ts');

      const items = mod.getLockedItemsForChat('chat-1');
      expect(items).toHaveLength(1);
      expect(items[0].path).toBe('src/index.ts');
      expect(items[0].isFolder).toBe(false);
    });

    it('should add a locked folder via addLockedItem with isFolder flag', async () => {
      const mod = await importLockedFiles();
      // NOTE: addLockedFolder has a known issue — it does not pass isFolder: true.
      // Use addLockedItem directly when a true folder lock is needed.
      mod.addLockedItem('chat-1', 'src/utils', true);

      const items = mod.getLockedItemsForChat('chat-1');
      expect(items).toHaveLength(1);
      expect(items[0].path).toBe('src/utils');
      expect(items[0].isFolder).toBe(true);
    });

    it('addLockedFolder adds item with isFolder: false (known source behaviour)', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFolder('chat-1', 'src/utils');

      const items = mod.getLockedItemsForChat('chat-1');
      expect(items).toHaveLength(1);
      // addLockedFolder calls addLockedItem without the isFolder arg,
      // so it defaults to false. This documents the actual behaviour.
      expect(items[0].isFolder).toBe(false);
    });

    it('should not duplicate an already-locked path', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'src/index.ts');
      mod.addLockedFile('chat-1', 'src/index.ts');

      const items = mod.getLockedItemsForChat('chat-1');
      expect(items).toHaveLength(1);
    });

    it('should keep locks from different chats separate', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'src/a.ts');
      mod.addLockedFile('chat-2', 'src/b.ts');

      expect(mod.getLockedItemsForChat('chat-1')).toHaveLength(1);
      expect(mod.getLockedItemsForChat('chat-2')).toHaveLength(1);
      expect(mod.getLockedItems()).toHaveLength(2);
    });

    it('should persist to localStorage (debounced)', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'src/index.ts');

      // Before debounce fires, localStorage should not be written
      expect(ls.setItem).not.toHaveBeenCalled();

      // Advance timers to trigger the debounced save
      vi.advanceTimersByTime(300);

      expect(ls.setItem).toHaveBeenCalledWith(
        'bolt.lockedFiles',
        JSON.stringify([{ chatId: 'chat-1', path: 'src/index.ts', isFolder: false }]),
      );
    });
  });

  describe('removeLockedFile / removeLockedFolder', () => {
    it('should remove a locked file', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'src/a.ts');
      mod.addLockedFile('chat-1', 'src/b.ts');

      mod.removeLockedFile('chat-1', 'src/a.ts');

      const items = mod.getLockedItemsForChat('chat-1');
      expect(items).toHaveLength(1);
      expect(items[0].path).toBe('src/b.ts');
    });

    it('should remove a locked folder', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFolder('chat-1', 'src/utils');
      mod.removeLockedFolder('chat-1', 'src/utils');

      expect(mod.getLockedItemsForChat('chat-1')).toHaveLength(0);
    });

    it('should be a no-op for a non-existent lock', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'src/a.ts');

      mod.removeLockedFile('chat-1', 'non-existent.ts');

      expect(mod.getLockedItemsForChat('chat-1')).toHaveLength(1);
    });

    it('should not affect other chats when removing', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'src/a.ts');
      mod.addLockedFile('chat-2', 'src/a.ts');

      mod.removeLockedFile('chat-1', 'src/a.ts');

      expect(mod.getLockedItemsForChat('chat-1')).toHaveLength(0);
      expect(mod.getLockedItemsForChat('chat-2')).toHaveLength(1);
    });
  });

  describe('isPathDirectlyLocked', () => {
    it('should return locked: true for a directly locked file', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'src/index.ts');

      expect(mod.isPathDirectlyLocked('chat-1', 'src/index.ts')).toEqual({ locked: true, isFolder: false });
    });

    it('should return locked: true for a directly locked folder', async () => {
      const mod = await importLockedFiles();
      mod.addLockedItem('chat-1', 'src/utils', true);

      expect(mod.isPathDirectlyLocked('chat-1', 'src/utils')).toEqual({ locked: true, isFolder: true });
    });

    it('should return locked: false for an unlocked path', async () => {
      const mod = await importLockedFiles();
      expect(mod.isPathDirectlyLocked('chat-1', 'src/index.ts')).toEqual({ locked: false });
    });

    it('should return locked: false for a path locked in a different chat', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'src/index.ts');

      expect(mod.isPathDirectlyLocked('chat-2', 'src/index.ts')).toEqual({ locked: false });
    });
  });

  describe('isFileLocked', () => {
    it('should detect a directly locked file', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'src/index.ts');

      expect(mod.isFileLocked('chat-1', 'src/index.ts')).toEqual({ locked: true, lockedBy: 'src/index.ts' });
    });

    it('should detect a file locked by a parent folder', async () => {
      const mod = await importLockedFiles();
      mod.addLockedItem('chat-1', 'src', true);

      expect(mod.isFileLocked('chat-1', 'src/index.ts')).toEqual({ locked: true, lockedBy: 'src' });
    });

    it('should detect a file locked by a nested parent folder', async () => {
      const mod = await importLockedFiles();
      mod.addLockedItem('chat-1', 'src/utils', true);

      expect(mod.isFileLocked('chat-1', 'src/utils/helper.ts')).toEqual({ locked: true, lockedBy: 'src/utils' });
    });

    it('should return locked: false for a file not under any lock', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFolder('chat-1', 'src/utils');

      expect(mod.isFileLocked('chat-1', 'src/index.ts')).toEqual({ locked: false });
    });

    it('should not count a file-level lock as a folder lock for child paths', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'src/index.ts');

      // A different file should not be locked
      expect(mod.isFileLocked('chat-1', 'src/other.ts')).toEqual({ locked: false });
    });
  });

  describe('isFolderLocked', () => {
    it('should detect a directly locked folder', async () => {
      const mod = await importLockedFiles();
      mod.addLockedItem('chat-1', 'src/utils', true);

      expect(mod.isFolderLocked('chat-1', 'src/utils')).toEqual({ locked: true, lockedBy: 'src/utils' });
    });

    it('should detect a folder locked by a parent folder', async () => {
      const mod = await importLockedFiles();
      mod.addLockedItem('chat-1', 'src', true);

      expect(mod.isFolderLocked('chat-1', 'src/utils')).toEqual({ locked: true, lockedBy: 'src' });
    });

    it('should return locked: false for an unlocked folder', async () => {
      const mod = await importLockedFiles();
      expect(mod.isFolderLocked('chat-1', 'src/utils')).toEqual({ locked: false });
    });

    it('should not treat a file lock as a folder lock', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'src');

      // 'src' is locked as a file, not a folder, so isFolderLocked should be false
      expect(mod.isFolderLocked('chat-1', 'src')).toEqual({ locked: false });
    });
  });

  describe('isPathInLockedFolder', () => {
    it('should return locked: true when path is inside a locked folder', async () => {
      const mod = await importLockedFiles();
      mod.addLockedItem('chat-1', 'src/components', true);

      expect(mod.isPathInLockedFolder('chat-1', 'src/components/Button.tsx')).toEqual({
        locked: true,
        lockedBy: 'src/components',
      });
    });

    it('should return locked: false when path is not inside any locked folder', async () => {
      const mod = await importLockedFiles();
      expect(mod.isPathInLockedFolder('chat-1', 'src/index.ts')).toEqual({ locked: false });
    });
  });

  describe('getLockedFilesForChat / getLockedFoldersForChat', () => {
    it('should return only file locks', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'a.ts');
      mod.addLockedItem('chat-1', 'src', true);
      mod.addLockedFile('chat-1', 'b.ts');

      const files = mod.getLockedFilesForChat('chat-1');
      expect(files).toHaveLength(2);
      expect(files.every((f) => !f.isFolder)).toBe(true);
    });

    it('should return only folder locks', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'a.ts');
      mod.addLockedItem('chat-1', 'src', true);
      mod.addLockedItem('chat-1', 'lib', true);

      const folders = mod.getLockedFoldersForChat('chat-1');
      expect(folders).toHaveLength(2);
      expect(folders.every((f) => f.isFolder)).toBe(true);
    });
  });

  describe('batchLockItems', () => {
    it('should lock multiple items at once', async () => {
      const mod = await importLockedFiles();
      mod.batchLockItems('chat-1', [
        { path: 'a.ts', isFolder: false },
        { path: 'b.ts', isFolder: false },
        { path: 'src', isFolder: true },
      ]);

      expect(mod.getLockedItemsForChat('chat-1')).toHaveLength(3);
    });

    it('should do nothing for an empty items array', async () => {
      const mod = await importLockedFiles();
      mod.batchLockItems('chat-1', []);

      expect(mod.getLockedItemsForChat('chat-1')).toHaveLength(0);
    });

    it('should replace existing locks for the same paths', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'a.ts');

      mod.batchLockItems('chat-1', [{ path: 'a.ts', isFolder: true }]);

      const items = mod.getLockedItemsForChat('chat-1');
      expect(items).toHaveLength(1);
      expect(items[0].isFolder).toBe(true);
    });

    it('should not affect other chats', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'shared.ts');

      mod.batchLockItems('chat-2', [{ path: 'other.ts', isFolder: false }]);

      expect(mod.getLockedItemsForChat('chat-1')).toHaveLength(1);
      expect(mod.getLockedItemsForChat('chat-2')).toHaveLength(1);
    });
  });

  describe('batchUnlockItems', () => {
    it('should unlock multiple items at once', async () => {
      const mod = await importLockedFiles();
      mod.batchLockItems('chat-1', [
        { path: 'a.ts', isFolder: false },
        { path: 'b.ts', isFolder: false },
        { path: 'c.ts', isFolder: false },
      ]);

      mod.batchUnlockItems('chat-1', ['a.ts', 'c.ts']);

      expect(mod.getLockedItemsForChat('chat-1')).toHaveLength(1);
      expect(mod.getLockedItemsForChat('chat-1')[0].path).toBe('b.ts');
    });

    it('should do nothing for an empty paths array', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'a.ts');

      mod.batchUnlockItems('chat-1', []);

      expect(mod.getLockedItemsForChat('chat-1')).toHaveLength(1);
    });

    it('should not remove locks from other chats', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'shared.ts');
      mod.addLockedFile('chat-2', 'shared.ts');

      mod.batchUnlockItems('chat-1', ['shared.ts']);

      expect(mod.getLockedItemsForChat('chat-1')).toHaveLength(0);
      expect(mod.getLockedItemsForChat('chat-2')).toHaveLength(1);
    });
  });

  describe('migrateLegacyLocks', () => {
    it('should assign chatId and isFolder to legacy items', async () => {
      const legacy = [{ path: 'old.ts' }]; // No chatId, no isFolder
      ls._store.set('bolt.lockedFiles', JSON.stringify(legacy));

      const mod = await importLockedFiles();
      mod.migrateLegacyLocks('current-chat');

      // Advance timers for debounced save
      vi.advanceTimersByTime(300);

      const saved = JSON.parse(ls._store.get('bolt.lockedFiles')!);
      expect(saved[0].chatId).toBe('current-chat');
      expect(saved[0].isFolder).toBe(false);
    });

    it('should not modify already-migrated items', async () => {
      const migrated = [{ chatId: 'chat-1', path: 'a.ts', isFolder: false }];
      ls._store.set('bolt.lockedFiles', JSON.stringify(migrated));

      const mod = await importLockedFiles();
      mod.migrateLegacyLocks('current-chat');

      // No debounce should fire since nothing changed
      vi.advanceTimersByTime(300);

      const saved = JSON.parse(ls._store.get('bolt.lockedFiles')!);
      expect(saved[0].chatId).toBe('chat-1'); // unchanged
    });

    it('should handle missing localStorage gracefully', async () => {
      const mod = await importLockedFiles();
      expect(() => mod.migrateLegacyLocks('current-chat')).not.toThrow();
    });
  });

  describe('clearCache', () => {
    it('should force a reload from localStorage on next access', async () => {
      const mod = await importLockedFiles();
      mod.addLockedFile('chat-1', 'a.ts');
      vi.advanceTimersByTime(300); // flush save

      // Simulate external modification of localStorage
      const newData = [{ chatId: 'chat-2', path: 'external.ts', isFolder: false }];
      ls._store.set('bolt.lockedFiles', JSON.stringify(newData));

      mod.clearCache();

      const items = mod.getLockedItems();
      expect(items).toHaveLength(1);
      expect(items[0].chatId).toBe('chat-2');
    });
  });
});