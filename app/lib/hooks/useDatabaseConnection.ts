import { useStore } from '@nanostores/react';
import { useCallback, useEffect } from 'react';
import {
  databaseConnection,
  fetchDatabaseInfo,
  initializeDatabaseConnection,
  isFetchingDatabaseInfo,
} from '~/lib/stores/database';

export function useDatabaseConnection() {
  const connection = useStore(databaseConnection);
  const fetching = useStore(isFetchingDatabaseInfo);
  const refresh = useCallback(() => fetchDatabaseInfo(), []);

  useEffect(() => {
    initializeDatabaseConnection().catch((error) => console.error('Failed to initialize database connection', error));
  }, []);

  return {
    connection,
    fetching,
    isConnected: connection.connected,
    refresh,
  };
}
