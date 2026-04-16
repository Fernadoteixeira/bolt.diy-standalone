import { atom } from 'nanostores';

export interface DatabaseConnectionState {
  configured: boolean;
  connected: boolean;
  error?: string | null;
  routes: {
    status: string;
    query: string;
    memorySearch: string;
    tileTemplate: string;
  };
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
  };
  vector: {
    enabled: boolean;
    dimensions: number;
  };
  memoryCount: number;
  latestMemoryAt?: string | null;
}

const defaultState: DatabaseConnectionState = {
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
};

export const databaseConnection = atom<DatabaseConnectionState>(defaultState);
export const isFetchingDatabaseInfo = atom(false);

export async function fetchDatabaseInfo() {
  isFetchingDatabaseInfo.set(true);

  try {
    const response = await fetch('/api/database');

    if (!response.ok) {
      throw new Error(`Failed to fetch database status (${response.status})`);
    }

    const data = (await response.json()) as DatabaseConnectionState;
    databaseConnection.set({
      ...defaultState,
      ...data,
    });

    return data;
  } finally {
    isFetchingDatabaseInfo.set(false);
  }
}

export async function initializeDatabaseConnection() {
  try {
    return await fetchDatabaseInfo();
  } catch (error) {
    databaseConnection.set({
      ...defaultState,
      error: error instanceof Error ? error.message : 'Database connection is unavailable',
    });

    throw error;
  }
}
