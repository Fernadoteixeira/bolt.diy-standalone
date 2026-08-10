import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { databaseConnection, isFetchingDatabaseInfo, fetchDatabaseInfo, initializeDatabaseConnection } from '~/lib/stores/database';
import type { DatabaseConnectionState } from '~/lib/stores/database';

describe('Database Connection Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset atoms to default state
    databaseConnection.set({
      configured: false,
      connected: false,
      error: null,
      routes: {
        status: '/api/database',
        query: '/api/database/query',
        memorySearch: '/api/memories/search',
        tileTemplate: '/api/map/tiles/{z}/{x}/{y}',
      },
      postgres: {
        host: 'postgres',
        port: 5432,
        database: 'bolt',
        user: 'bolt',
      },
      vector: {
        enabled: true,
        dimensions: 256,
      },
      memoryCount: 0,
      latestMemoryAt: null,
    });
    isFetchingDatabaseInfo.set(false);
  });

  describe('default state', () => {
    it('should have sensible defaults', () => {
      const state = databaseConnection.get();
      expect(state.configured).toBe(false);
      expect(state.connected).toBe(false);
      expect(state.error).toBeNull();
      expect(state.routes.status).toBe('/api/database');
      expect(state.routes.query).toBe('/api/database/query');
      expect(state.postgres.host).toBe('postgres');
      expect(state.postgres.port).toBe(5432);
      expect(state.vector.enabled).toBe(true);
      expect(state.vector.dimensions).toBe(256);
      expect(state.memoryCount).toBe(0);
    });

    it('should expose isFetchingDatabaseInfo atom defaulting to false', () => {
      expect(isFetchingDatabaseInfo.get()).toBe(false);
    });
  });

  describe('fetchDatabaseInfo', () => {
    it('should fetch and merge database status on success', async () => {
      const mockData: Partial<DatabaseConnectionState> = {
        configured: true,
        connected: true,
        memoryCount: 42,
        postgres: {
          host: 'db.example.com',
          port: 5433,
          database: 'mydb',
          user: 'admin',
        },
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockData,
      });

      const result = await fetchDatabaseInfo();

      expect(global.fetch).toHaveBeenCalledWith('/api/database');
      expect(result).toEqual(mockData);

      const state = databaseConnection.get();
      expect(state.configured).toBe(true);
      expect(state.connected).toBe(true);
      expect(state.memoryCount).toBe(42);
      expect(state.postgres.host).toBe('db.example.com');
      expect(state.postgres.port).toBe(5433);
    });

    it('should preserve default routes when not overridden', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ configured: true }),
      });

      await fetchDatabaseInfo();

      const state = databaseConnection.get();
      expect(state.routes.status).toBe('/api/database');
      expect(state.routes.query).toBe('/api/database/query');
    });

    it('should throw when the response is not ok', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(fetchDatabaseInfo()).rejects.toThrow('Failed to fetch database status (500)');

      expect(isFetchingDatabaseInfo.get()).toBe(false);
    });

    it('should set isFetchingDatabaseInfo during fetch and reset after', async () => {
      let resolveFetch: (value: any) => void;
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      (global.fetch as any).mockReturnValue(fetchPromise);

      const fetchInfoPromise = fetchDatabaseInfo();

      // While fetch is in-flight, the flag should be true
      expect(isFetchingDatabaseInfo.get()).toBe(true);

      resolveFetch!({
        ok: true,
        status: 200,
        json: async () => ({ configured: true }),
      });

      await fetchInfoPromise;

      expect(isFetchingDatabaseInfo.get()).toBe(false);
    });

    it('should reset isFetchingDatabaseInfo even when fetch fails', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(fetchDatabaseInfo()).rejects.toThrow();
      expect(isFetchingDatabaseInfo.get()).toBe(false);
    });
  });

  describe('initializeDatabaseConnection', () => {
    it('should return data on success', async () => {
      const mockData = { configured: true, connected: true, memoryCount: 10 };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockData,
      });

      const result = await initializeDatabaseConnection();

      expect(result).toEqual(mockData);
      expect(databaseConnection.get().configured).toBe(true);
    });

    it('should set error state on failure and re-throw', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      await expect(initializeDatabaseConnection()).rejects.toThrow('Failed to fetch database status (503)');

      const state = databaseConnection.get();
      expect(state.error).toBe('Failed to fetch database status (503)');
      // Other fields keep their defaults since data was never set
      expect(state.configured).toBe(false);
    });

    it('should set a generic error message for non-Error exceptions', async () => {
      (global.fetch as any).mockRejectedValue('network failure');

      await expect(initializeDatabaseConnection()).rejects.toBe('network failure');

      const state = databaseConnection.get();
      expect(state.error).toBe('Database connection is unavailable');
    });
  });
});