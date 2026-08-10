import { json, type LoaderFunction, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { resolveGitHubToken } from '~/lib/.server/github-token';
import { withSecurity } from '~/lib/security';

export const loader: LoaderFunction = withSecurity(
  async ({ request, context }: LoaderFunctionArgs) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const token = resolveGitHubToken({ request, context });

    if (!token) {
      return json(
        { error: 'No GitHub token available' },
        {
          status: 401,
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    }

    const response = await fetch('https://api.github.com/user/orgs', {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const orgs = await response.json();

    return json(
      { organizations: orgs },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  } catch (error) {
    console.error('GitHub orgs API error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }
  },
  { allowedMethods: ['GET', 'OPTIONS'], requireAuth: true },
);
