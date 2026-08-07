import { useState } from 'react';
import { useEffect } from 'react';
import { Dialog, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { useDatabaseConnection } from '~/lib/hooks/useDatabaseConnection';

export function DatabaseConnection() {
  const { connection, fetching, refresh, isConnected } = useDatabaseConnection();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openDialog = () => setOpen(true);
    document.addEventListener('open-database-connection', openDialog);

    return () => {
      document.removeEventListener('open-database-connection', openDialog);
    };
  }, []);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm text-white hover:bg-bolt-elements-item-backgroundActive"
      >
        <div className="i-ph:database text-base" />
        <span className="text-xs">{isConnected ? 'PostgreSQL' : 'DB offline'}</span>
      </button>

      <DialogRoot open={open} onOpenChange={setOpen}>
        {open && (
          <Dialog className="max-w-[560px] p-6">
            <div className="p-6 space-y-4">
              <DialogTitle>
                <div className="i-ph:database text-xl" />
                Local PostgreSQL services
              </DialogTitle>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-bolt-elements-borderColor p-4">
                  <div className="text-xs uppercase tracking-wide text-bolt-elements-textTertiary">Status</div>
                  <div className="mt-2 text-sm font-semibold text-bolt-elements-textPrimary">
                    {fetching ? 'Checking…' : isConnected ? 'Connected' : 'Unavailable'}
                  </div>
                </div>
                <div className="rounded-lg border border-bolt-elements-borderColor p-4">
                  <div className="text-xs uppercase tracking-wide text-bolt-elements-textTertiary">Vector memory</div>
                  <div className="mt-2 text-sm font-semibold text-bolt-elements-textPrimary">
                    {connection.memoryCount} stored
                  </div>
                </div>
                <div className="rounded-lg border border-bolt-elements-borderColor p-4">
                  <div className="text-xs uppercase tracking-wide text-bolt-elements-textTertiary">Tiles</div>
                  <div className="mt-2 text-sm font-semibold text-bolt-elements-textPrimary">Offline ready</div>
                </div>
              </div>

              <div className="rounded-lg border border-bolt-elements-borderColor p-4 space-y-2 text-sm text-bolt-elements-textSecondary">
                <div>
                  <span className="text-bolt-elements-textPrimary font-medium">Database:</span>{' '}
                  {connection.postgres.user}@{connection.postgres.host}:{connection.postgres.port}/
                  {connection.postgres.database}
                </div>
                <div>
                  <span className="text-bolt-elements-textPrimary font-medium">Query route:</span>{' '}
                  {connection.routes.query}
                </div>
                <div>
                  <span className="text-bolt-elements-textPrimary font-medium">Memory route:</span>{' '}
                  {connection.routes.memorySearch}
                </div>
                <div>
                  <span className="text-bolt-elements-textPrimary font-medium">Tile template:</span>{' '}
                  {connection.routes.tileTemplate}
                </div>
                {connection.error && (
                  <div className="text-red-400">
                    <span className="text-bolt-elements-textPrimary font-medium">Error:</span> {connection.error}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    refresh().catch((error) => console.error('Failed to refresh database connection', error))
                  }
                  className="px-4 py-2 rounded-md bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent"
                >
                  Refresh
                </button>
              </div>
            </div>
          </Dialog>
        )}
      </DialogRoot>
    </div>
  );
}
