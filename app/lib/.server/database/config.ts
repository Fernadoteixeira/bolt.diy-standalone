const DEFAULT_VECTOR_DIMENSIONS = 256;
const DEFAULT_TILE_TEMPLATE = '/api/map/tiles/{z}/{x}/{y}';

type EnvironmentSource = Env | Record<string, string | undefined> | undefined;

function readEnv(source: EnvironmentSource, key: string, fallback = ''): string {
  const value = (source as Record<string, string | undefined> | undefined)?.[key];

  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (typeof process !== 'undefined' && typeof process.env?.[key] === 'string' && process.env[key]) {
    return process.env[key] as string;
  }

  return fallback;
}

function readInt(source: EnvironmentSource, key: string, fallback: number): number {
  const value = Number(readEnv(source, key, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

export interface LocalDatabaseConfig {
  apiUrl: string;
  postgresHost: string;
  postgresPort: number;
  postgresDatabase: string;
  postgresUser: string;
  postgresPassword: string;
  vectorDimensions: number;
  mapTileUrlTemplate: string;
}

export interface ClientDatabaseInfo {
  configured: boolean;
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
}

export function resolveLocalDatabaseConfig(source?: EnvironmentSource): LocalDatabaseConfig {
  return {
    apiUrl: readEnv(source, 'POSTGREST_URL'),
    postgresHost: readEnv(source, 'POSTGRES_HOST', 'postgres'),
    postgresPort: readInt(source, 'POSTGRES_PORT', 5432),
    postgresDatabase: readEnv(source, 'POSTGRES_DB', 'bolt'),
    postgresUser: readEnv(source, 'POSTGRES_USER', 'bolt'),
    postgresPassword: readEnv(source, 'POSTGRES_PASSWORD', 'bolt'),
    vectorDimensions: readInt(source, 'POSTGRES_VECTOR_DIMENSIONS', DEFAULT_VECTOR_DIMENSIONS),
    mapTileUrlTemplate: readEnv(source, 'LOCAL_MAP_TILE_URL_TEMPLATE', DEFAULT_TILE_TEMPLATE),
  };
}

export function getClientDatabaseInfo(source?: EnvironmentSource): ClientDatabaseInfo {
  const config = resolveLocalDatabaseConfig(source);

  return {
    configured: Boolean(config.apiUrl),
    routes: {
      status: '/api/database',
      query: '/api/database/query',
      memorySearch: '/api/memories/search',
      tileTemplate: config.mapTileUrlTemplate,
    },
    postgres: {
      host: config.postgresHost,
      port: config.postgresPort,
      database: config.postgresDatabase,
      user: config.postgresUser,
    },
    vector: {
      enabled: true,
      dimensions: config.vectorDimensions,
    },
  };
}
