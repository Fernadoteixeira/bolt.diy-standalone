import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';

export const loader = withSecurity(
  async ({ request: _request }: LoaderFunctionArgs) => {
  return json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
  },
  { allowedMethods: ['GET'] },
);
