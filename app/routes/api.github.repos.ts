import { json, type LoaderFunction, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { resolveGitHubToken } from '~/lib/.server/github-token';
import { withSecurity } from '~/lib/security';

interface GitHubRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  languages_url: string;
}

interface GitHubGist {
  id: string;
  html_url: string;
  description: string;
}

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

    const reposResponse = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!reposResponse.ok) {
      throw new Error(`GitHub API error: ${reposResponse.status}`);
    }

    const repos = (await reposResponse.json()) as GitHubRepo[];

    // Get user's gists
    const gistsResponse = await fetch('https://api.github.com/gists', {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token}`,
      },
    });

    const gists = gistsResponse.ok ? ((await gistsResponse.json()) as GitHubGist[]) : [];

    // Calculate language statistics
    const languageStats: Record<string, number> = {};

    let totalStars = 0;
    let totalForks = 0;

    for (const repo of repos) {
      totalStars += repo.stargazers_count || 0;
      totalForks += repo.forks_count || 0;

      if (repo.language && repo.language !== 'null') {
        languageStats[repo.language] = (languageStats[repo.language] || 0) + 1;
      }
    }

    return json(
      {
        repos,
        stats: {
          totalStars,
          totalForks,
          languages: languageStats,
          totalGists: gists.length,
        },
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  } catch (error) {
    console.error('GitHub repos API error:', error);
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
