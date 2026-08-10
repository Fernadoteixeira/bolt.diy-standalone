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

    // Get username from cookie or token claims
    const cookieUsername = request.headers
      .get('Cookie')
      ?.split(';')
      .find((cookie) => cookie.trim().startsWith('githubUsername='))
      ?.split('=')[1];

    if (!cookieUsername) {
      return json(
        { error: 'GitHub username not found in cookies' },
        {
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    }

    const response = await fetch(`https://api.github.com/users/${cookieUsername}/events?per_page=30`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const events = await response.json();

    return json(
      { recentActivity: events },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  } catch (error) {
    console.error('GitHub activity API error:', error);
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
