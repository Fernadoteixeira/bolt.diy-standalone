import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getDatabaseHealth } from '~/lib/.server/database/client';
import { getClientDatabaseInfo } from '~/lib/.server/database/config';
import { withSecurity } from '~/lib/security';

async function databaseLoader({ context }: LoaderFunctionArgs) {
  const env = context?.cloudflare?.env;
  const info = getClientDatabaseInfo(env);
  const health = await getDatabaseHealth(env);

  return json({
    ...info,
    connected: health.connected,
    error: health.error,
    memoryCount: health.memoryCount,
    latestMemoryAt: health.latestMemoryAt,
    vector: {
      ...info.vector,
      dimensions: health.vectorDimensions || info.vector.dimensions,
    },
  });
}

export const loader = withSecurity(databaseLoader, {
  rateLimit: true,
  allowedMethods: ['GET'],
});
