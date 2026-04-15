import { resolveLocalDatabaseConfig } from './config';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('database.client');

const PROFILE_HEADERS = {
  'Accept-Profile': 'bolt_ai',
  'Content-Profile': 'bolt_ai',
};

type EnvironmentSource = Env | Record<string, string | undefined> | undefined;

function buildPostgrestCandidates(apiUrl: string): string[] {
  const base = apiUrl.replace(/\/$/, '');
  const candidates = [base];

  // Allow host runtime and Docker runtime to both work with one config.
  if (base.includes('postgrest')) {
    candidates.push(base.replace('postgrest', '127.0.0.1'));
  }

  if (base.includes('127.0.0.1') || base.includes('localhost')) {
    candidates.push(base.replace('127.0.0.1', 'postgrest').replace('localhost', 'postgrest'));
  }

  return [...new Set(candidates)];
}

async function parseResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function postgrestRpc<T>(
  name: string,
  payload: Record<string, unknown>,
  source?: EnvironmentSource,
): Promise<T> {
  const { apiUrl } = resolveLocalDatabaseConfig(source);

  if (!apiUrl) {
    throw new Error('PostgREST URL is not configured');
  }

  const candidates = buildPostgrestCandidates(apiUrl);
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate}/rpc/${name}`, {
        method: 'POST',
        headers: {
          ...PROFILE_HEADERS,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await parseResponse(response);

      if (!response.ok) {
        logger.error(`PostgREST rpc/${name} failed`, {
          endpoint: candidate,
          status: response.status,
          data,
        });

        const message =
          typeof data === 'string'
            ? data
            : (data as { message?: string; hint?: string })?.message || `PostgREST RPC ${name} failed`;

        throw new Error(message);
      }

      return data as T;
    } catch (error) {
      lastError = error;

      logger.warn(`PostgREST rpc/${name} attempt failed`, {
        endpoint: candidate,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw (lastError instanceof Error ? lastError : new Error(`PostgREST RPC ${name} failed`));
}

export async function getDatabaseHealth(source?: EnvironmentSource) {
  const config = resolveLocalDatabaseConfig(source);

  if (!config.apiUrl) {
    return {
      connected: false,
      error: 'PostgREST URL is not configured',
      memoryCount: 0,
      latestMemoryAt: null,
    };
  }

  try {
    const stats = await postgrestRpc<{
      memoryCount?: number;
      latestMemoryAt?: string | null;
      vectorDimensions?: number;
    }>('memory_stats', {}, source);

    return {
      connected: true,
      error: null,
      memoryCount: Number(stats?.memoryCount || 0),
      latestMemoryAt: stats?.latestMemoryAt || null,
      vectorDimensions: Number(stats?.vectorDimensions || config.vectorDimensions),
    };
  } catch (error) {
    logger.error('Database health check failed', error);

    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown database error',
      memoryCount: 0,
      latestMemoryAt: null,
      vectorDimensions: config.vectorDimensions,
    };
  }
}

export async function executeDatabaseQuery(query: string, source?: EnvironmentSource) {
  return postgrestRpc<{ mode: 'rows' | 'command'; rows?: unknown[]; rowsAffected?: number; status?: string }>(
    'execute_sql',
    { query_text: query },
    source,
  );
}

export interface UpsertMemoryPayload {
  memory_key: string;
  chat_id?: string | null;
  source?: string;
  content: string;
  summary?: string | null;
  metadata?: Record<string, unknown>;
  embedding: number[];
  [key: string]: unknown;
}

export interface MemoryMatch {
  id: string;
  memory_key: string;
  chat_id?: string | null;
  source: string;
  content: string;
  summary?: string | null;
  metadata?: Record<string, unknown>;
  similarity: number;
  updated_at: string;
}

export async function upsertMemory(payload: UpsertMemoryPayload, source?: EnvironmentSource) {
  return postgrestRpc<MemoryMatch>('upsert_memory', payload, source);
}

export async function matchMemories(
  queryEmbedding: number[],
  options?: {
    matchLimit?: number;
    filterChatId?: string | null;
  },
  source?: EnvironmentSource,
) {
  return postgrestRpc<MemoryMatch[]>(
    'match_memories',
    {
      query_embedding: queryEmbedding,
      match_limit: options?.matchLimit ?? 8,
      filter_chat_id: options?.filterChatId ?? null,
    },
    source,
  );
}
