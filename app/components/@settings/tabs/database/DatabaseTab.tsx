import { useMemo, useState } from 'react';
import { LocalMapWidget } from './LocalMapWidget';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/Card';
import { useDatabaseConnection } from '~/lib/hooks/useDatabaseConnection';

interface MemorySearchResult {
  id: string;
  summary?: string | null;
  content: string;
  similarity: number;
  updated_at: string;
}

export default function DatabaseTab() {
  const { connection, fetching, refresh } = useDatabaseConnection();
  const [query, setQuery] = useState('select now() as server_time, current_database() as database_name;');
  const [queryResult, setQueryResult] = useState<string>('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [memoryQuery, setMemoryQuery] = useState('docker persistence');
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryResults, setMemoryResults] = useState<MemorySearchResult[]>([]);

  const latestMemory = useMemo(() => {
    if (!connection.latestMemoryAt) {
      return 'No semantic memories stored yet';
    }

    return new Date(connection.latestMemoryAt).toLocaleString();
  }, [connection.latestMemoryAt]);

  const runQuery = async () => {
    setQueryLoading(true);

    try {
      const response = await fetch(connection.routes.query, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      const data = (await response.json()) as { result?: unknown; error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Query execution failed');
      }

      setQueryResult(JSON.stringify(data.result, null, 2));
    } catch (error) {
      setQueryResult(error instanceof Error ? error.message : 'Query execution failed');
    } finally {
      setQueryLoading(false);
    }
  };

  const runMemorySearch = async () => {
    setMemoryLoading(true);

    try {
      const response = await fetch(connection.routes.memorySearch, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: memoryQuery, limit: 6 }),
      });

      const data = (await response.json()) as { results?: MemorySearchResult[] };
      setMemoryResults(data.results || []);
    } finally {
      setMemoryLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">PostgreSQL + pgvector</CardTitle>
          <CardDescription>
            Local database services now back interactive development, semantic memory, and database actions without
            Supabase.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-bolt-elements-borderColor p-4">
            <div className="text-xs uppercase tracking-wide text-bolt-elements-textTertiary">Status</div>
            <div className="mt-2 text-lg font-semibold text-bolt-elements-textPrimary">
              {fetching ? 'Checking…' : connection.connected ? 'Connected' : 'Unavailable'}
            </div>
            {connection.error && <p className="mt-2 text-sm text-red-400">{connection.error}</p>}
          </div>
          <div className="rounded-lg border border-bolt-elements-borderColor p-4">
            <div className="text-xs uppercase tracking-wide text-bolt-elements-textTertiary">Vector memory</div>
            <div className="mt-2 text-lg font-semibold text-bolt-elements-textPrimary">
              {connection.memoryCount} memories
            </div>
            <p className="mt-2 text-sm text-bolt-elements-textSecondary">Latest update: {latestMemory}</p>
          </div>
          <div className="rounded-lg border border-bolt-elements-borderColor p-4">
            <div className="text-xs uppercase tracking-wide text-bolt-elements-textTertiary">Connection</div>
            <div className="mt-2 text-sm text-bolt-elements-textPrimary">
              {connection.postgres.user}@{connection.postgres.host}:{connection.postgres.port}/
              {connection.postgres.database}
            </div>
            <p className="mt-2 text-sm text-bolt-elements-textSecondary">
              Vector dimension: {connection.vector.dimensions}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Local query console</CardTitle>
            <CardDescription>
              Runs against the internal PostgreSQL service through the local PostgREST bridge.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full min-h-[180px] rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-sm text-bolt-elements-textPrimary"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={runQuery}
                disabled={queryLoading || !connection.connected}
                className="px-4 py-2 rounded-md bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent disabled:opacity-50"
              >
                {queryLoading ? 'Running…' : 'Run query'}
              </button>
              <button
                type="button"
                onClick={() => refresh().catch((error) => console.error('Failed to refresh database status', error))}
                className="px-4 py-2 rounded-md bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault"
              >
                Refresh status
              </button>
            </div>
            <pre className="min-h-[180px] overflow-auto rounded-lg bg-bolt-elements-background-depth-2 p-3 text-xs text-bolt-elements-textSecondary">
              {queryResult || 'Query results will appear here.'}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Semantic memory search</CardTitle>
            <CardDescription>
              Searches the pgvector-backed memory store using local deterministic embeddings for offline dev.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <input
                value={memoryQuery}
                onChange={(event) => setMemoryQuery(event.target.value)}
                className="flex-1 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm text-bolt-elements-textPrimary"
                placeholder="Search stored memories"
              />
              <button
                type="button"
                onClick={runMemorySearch}
                disabled={memoryLoading || !connection.connected}
                className="px-4 py-2 rounded-md bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent disabled:opacity-50"
              >
                {memoryLoading ? 'Searching…' : 'Search'}
              </button>
            </div>
            <div className="space-y-2">
              {memoryResults.length === 0 ? (
                <div className="rounded-lg border border-dashed border-bolt-elements-borderColor p-4 text-sm text-bolt-elements-textSecondary">
                  No memory matches yet. Send chat messages to start building semantic memory.
                </div>
              ) : (
                memoryResults.map((result) => (
                  <div key={result.id} className="rounded-lg border border-bolt-elements-borderColor p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-bolt-elements-textPrimary">
                        similarity {result.similarity.toFixed(3)}
                      </div>
                      <div className="text-xs text-bolt-elements-textTertiary">
                        {new Date(result.updated_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-bolt-elements-textSecondary whitespace-pre-wrap">
                      {result.summary || result.content}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Offline map widget</CardTitle>
          <CardDescription>
            Local slippy-map tiles are generated by Bolt itself, so the widget works without external tile providers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LocalMapWidget tileTemplate={connection.routes.tileTemplate} />
        </CardContent>
      </Card>
    </div>
  );
}
