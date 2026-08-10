import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { discoverLocalProviders, getRecommendedProvider } from '~/lib/services/local-provider-discovery';
import { withSecurity } from '~/lib/security';

/**
 * API endpoint for discovering local LLM providers
 *
 * GET /api/local-providers/discover
 * Returns list of discovered local providers with their models
 */
export const action = withSecurity(
  async ({ request }: ActionFunctionArgs) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const discovered = await discoverLocalProviders();
    const recommended = getRecommendedProvider(discovered);

    return json({
      providers: discovered,
      recommended: recommended
        ? {
            name: recommended.name,
            baseUrl: recommended.baseUrl,
            modelCount: recommended.models.length,
          }
        : null,
    });
  } catch (error) {
    console.error('Error discovering providers:', error);
    return json({ error: 'Failed to discover providers' }, { status: 500 });
  }
  },
  { allowedMethods: ['POST'], roles: ['operator', 'admin'] },
);

export async function loader() {
  return json({ error: 'Use POST method' }, { status: 405 });
}
