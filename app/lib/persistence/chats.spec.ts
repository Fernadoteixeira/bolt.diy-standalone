import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAllChats, getChatById, saveChat, deleteChat, deleteAllChats } from '~/lib/persistence/chats';
import type { Chat } from '~/lib/persistence/chats';

/**
 * Minimal async IDBRequest mock.
 * The result is computed lazily and onsuccess/onerror fire on the next tick.
 */
class MockRequest {
  result: any = undefined;
  error: any = undefined;
  source: any = null;
  readyState: any = 'pending';
  onsuccess: ((ev: any) => any) | null = null;
  onerror: ((ev: any) => any) | null = null;

  constructor(getResult: () => any, shouldError?: () => any) {
    queueMicrotask(() => {
      if (shouldError) {
        this.error = shouldError();
        this.onerror?.({ target: this });
      } else {
        this.result = getResult();
        this.onsuccess?.({ target: this });
      }
    });
  }
}

/**
 * A mock object store backed by a Map keyed by the record's `id`.
 */
class MockObjectStore {
  private data = new Map<string, any>();

  constructor(initial: Record<string, any> = {}) {
    for (const [key, value] of Object.entries(initial)) {
      this.data.set(key, value);
    }
  }

  getAll(): MockRequest {
    return new MockRequest(() => Array.from(this.data.values()));
  }

  get(key: string): MockRequest {
    return new MockRequest(() => this.data.get(key) ?? undefined);
  }

  put(value: any): MockRequest {
    const key = value.id;
    this.data.set(key, value);
    return new MockRequest(() => undefined);
  }

  delete(key: string): MockRequest {
    this.data.delete(key);
    return new MockRequest(() => undefined);
  }

  clear(): MockRequest {
    this.data.clear();
    return new MockRequest(() => undefined);
  }

  getAllKeys(): MockRequest {
    return new MockRequest(() => Array.from(this.data.keys()));
  }

  index(indexName: string): { get: (key: string) => MockRequest } {
    return {
      get: (key: string) =>
        new MockRequest(() => {
          for (const val of this.data.values()) {
            if (val[indexName] === key) return val;
          }
          return undefined;
        }),
    };
  }

  openCursor(): MockRequest {
    const entries = Array.from(this.data.entries());
    let idx = 0;
    const request: any = {
      result: undefined,
      error: undefined,
      onsuccess: null as ((ev: any) => any) | null,
      onerror: null as ((ev: any) => any) | null,
    };

    const fire = () => {
      if (idx < entries.length) {
        request.result = {
          value: entries[idx][1],
          continue: () => {
            idx++;
            queueMicrotask(fire);
          },
        };
      } else {
        request.result = undefined;
      }
      request.onsuccess?.({ target: request });
    };

    queueMicrotask(fire);
    return request as MockRequest;
  }

  // Test helper to inspect internal state
  _size() {
    return this.data.size;
  }

  _has(key: string) {
    return this.data.has(key);
  }
}

/**
 * Create a mock IDBDatabase with the given object stores.
 */
function createMockDB(stores: Record<string, MockObjectStore>): any {
  return {
    name: 'boltHistory',
    version: 2,
    transaction: vi.fn((storeNames: string[] | string, _mode?: string) => ({
      objectStore: (name: string) => {
        if (!stores[name]) {
          throw new Error(`Object store "${name}" not found`);
        }
        return stores[name];
      },
    })),
  };
}

const sampleChat: Chat = {
  id: '1',
  description: 'Test chat',
  messages: [{ id: 'msg-1', role: 'user', content: 'Hello' }] as any,
  timestamp: new Date('2024-01-01').toISOString(),
  urlId: 'url-1',
};

describe('Chats Persistence (IndexedDB layer)', () => {
  let chatsStore: MockObjectStore;

  beforeEach(() => {
    chatsStore = new MockObjectStore();
  });

  describe('getAllChats', () => {
    it('should return all chats from the store', async () => {
      chatsStore = new MockObjectStore({
        '1': { ...sampleChat, id: '1' },
        '2': { ...sampleChat, id: '2', description: 'Second chat' },
      });
      const db = createMockDB({ chats: chatsStore });

      const result = await getAllChats(db);

      expect(result).toHaveLength(2);
      expect(result.map((c) => c.id)).toContain('1');
      expect(result.map((c) => c.id)).toContain('2');
    });

    it('should return an empty array when the store is empty', async () => {
      const db = createMockDB({ chats: chatsStore });
      const result = await getAllChats(db);
      expect(result).toEqual([]);
    });

    it('should return an empty array when getAll result is falsy', async () => {
      // Override getAll to return undefined result
      const emptyStore: any = {
        getAll: () => new MockRequest(() => undefined),
      };
      const db = createMockDB({ chats: emptyStore });
      const result = await getAllChats(db);
      expect(result).toEqual([]);
    });

    it('should reject when the request errors', async () => {
      const errorStore: any = {
        getAll: () => new MockRequest(() => undefined, () => new Error('Read error')),
      };
      const db = createMockDB({ chats: errorStore });

      await expect(getAllChats(db)).rejects.toThrow('Read error');
    });

    it('should reject when the transaction throws', async () => {
      const db: any = {
        name: 'boltHistory',
        version: 2,
        transaction: () => {
          throw new Error('Transaction failed');
        },
      };

      await expect(getAllChats(db)).rejects.toThrow('Transaction failed');
    });
  });

  describe('getChatById', () => {
    it('should return the chat when found', async () => {
      chatsStore = new MockObjectStore({ '1': sampleChat });
      const db = createMockDB({ chats: chatsStore });

      const result = await getChatById(db, '1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('1');
      expect(result?.description).toBe('Test chat');
    });

    it('should return null when the chat is not found', async () => {
      const db = createMockDB({ chats: chatsStore });

      const result = await getChatById(db, 'non-existent');

      expect(result).toBeNull();
    });

    it('should reject when the request errors', async () => {
      const errorStore: any = {
        get: () => new MockRequest(() => undefined, () => new Error('DB error')),
      };
      const db = createMockDB({ chats: errorStore });

      await expect(getChatById(db, '1')).rejects.toThrow('DB error');
    });
  });

  describe('saveChat', () => {
    it('should save a chat to the store', async () => {
      const db = createMockDB({ chats: chatsStore });

      await saveChat(db, sampleChat);

      expect(chatsStore._has('1')).toBe(true);
    });

    it('should overwrite an existing chat with the same id', async () => {
      chatsStore = new MockObjectStore({ '1': sampleChat });
      const db = createMockDB({ chats: chatsStore });

      const updated: Chat = { ...sampleChat, description: 'Updated description' };
      await saveChat(db, updated);

      const result = await getChatById(db, '1');
      expect(result?.description).toBe('Updated description');
    });

    it('should reject when the put request errors', async () => {
      const errorStore: any = {
        put: () => new MockRequest(() => undefined, () => new Error('Write error')),
      };
      const db = createMockDB({ chats: errorStore });

      await expect(saveChat(db, sampleChat)).rejects.toThrow('Write error');
    });
  });

  describe('deleteChat', () => {
    it('should delete a chat by id', async () => {
      chatsStore = new MockObjectStore({ '1': sampleChat });
      const db = createMockDB({ chats: chatsStore });

      await deleteChat(db, '1');

      expect(chatsStore._has('1')).toBe(false);
    });

    it('should resolve even when deleting a non-existent chat', async () => {
      const db = createMockDB({ chats: chatsStore });

      await expect(deleteChat(db, 'non-existent')).resolves.toBeUndefined();
    });

    it('should reject when the delete request errors', async () => {
      const errorStore: any = {
        delete: () => new MockRequest(() => undefined, () => new Error('Delete error')),
      };
      const db = createMockDB({ chats: errorStore });

      await expect(deleteChat(db, '1')).rejects.toThrow('Delete error');
    });
  });

  describe('deleteAllChats', () => {
    it('should clear all chats from the store', async () => {
      chatsStore = new MockObjectStore({
        '1': sampleChat,
        '2': { ...sampleChat, id: '2' },
        '3': { ...sampleChat, id: '3' },
      });
      const db = createMockDB({ chats: chatsStore });

      await deleteAllChats(db);

      expect(chatsStore._size()).toBe(0);
    });

    it('should resolve when the store is already empty', async () => {
      const db = createMockDB({ chats: chatsStore });

      await expect(deleteAllChats(db)).resolves.toBeUndefined();
    });

    it('should reject when the clear request errors', async () => {
      const errorStore: any = {
        clear: () => new MockRequest(() => undefined, () => new Error('Clear error')),
      };
      const db = createMockDB({ chats: errorStore });

      await expect(deleteAllChats(db)).rejects.toThrow('Clear error');
    });
  });

  describe('transaction mode', () => {
    it('should use readonly mode for getAllChats', async () => {
      const db = createMockDB({ chats: chatsStore });
      await getAllChats(db);

      expect(db.transaction).toHaveBeenCalledWith(['chats'], 'readonly');
    });

    it('should use readwrite mode for saveChat', async () => {
      const db = createMockDB({ chats: chatsStore });
      await saveChat(db, sampleChat);

      expect(db.transaction).toHaveBeenCalledWith(['chats'], 'readwrite');
    });

    it('should use readwrite mode for deleteChat', async () => {
      const db = createMockDB({ chats: chatsStore });
      await deleteChat(db, '1');

      expect(db.transaction).toHaveBeenCalledWith(['chats'], 'readwrite');
    });

    it('should use readwrite mode for deleteAllChats', async () => {
      const db = createMockDB({ chats: chatsStore });
      await deleteAllChats(db);

      expect(db.transaction).toHaveBeenCalledWith(['chats'], 'readwrite');
    });
  });
});