import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { checkProviderAvailability } from '~/lib/services/local-provider-discovery';

/**
 * API endpoint for checking provider health
 *
 * POST /api/local-providers/health
 * Body: { baseUrl: string }
 * Returns health status of specified provider
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = (await request.json()) as { baseUrl?: string };
    const { baseUrl } = body;

    if (!baseUrl) {
      return json({ error: 'baseUrl is required' }, { status: 400 });
    }

    const health = await checkProviderAvailability(baseUrl);

    return json({
      baseUrl,
      available: health.available,
      responseTime: health.responseTime,
      error: health.error,
    });
  } catch (error) {
    console.error('Error checking provider health:', error);
    return json({ error: 'Failed to check provider health' }, { status: 500 });
  }
}

/**
 * GET endpoint for quick health check
 *
 * GET /api/local-providers/health?baseUrl=http://127.0.0.1:11434
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const baseUrl = url.searchParams.get('baseUrl');

  if (!baseUrl) {
    return json({ error: 'baseUrl query parameter is required' }, { status: 400 });
  }

  try {
    const health = await checkProviderAvailability(baseUrl);

    return json({
      baseUrl,
      available: health.available,
      responseTime: health.responseTime,
      error: health.error,
    });
  } catch (error) {
    console.error('Error checking provider health:', error);
    return json({ error: 'Failed to check provider health' }, { status: 500 });
  }
}
