import { getApiKeysFromCookie } from '~/lib/api/cookies';

const GITHUB_COOKIE_TOKEN_KEYS = ['GITHUB_API_KEY', 'VITE_GITHUB_ACCESS_TOKEN'] as const;
const GITHUB_ENV_TOKEN_KEYS = ['GITHUB_API_KEY', 'GITHUB_TOKEN', 'VITE_GITHUB_ACCESS_TOKEN'] as const;

function getFirstConfiguredValue(source: Record<string, unknown> | undefined, keys: readonly string[]) {
  if (!source) {
    return undefined;
  }

  for (const key of keys) {
    const value = source[key];

    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

export function resolveGitHubToken(options: { request?: Request; context?: any }) {
  const { request, context } = options;
  const cookieHeader = request?.headers.get('Cookie') ?? null;
  const apiKeys = getApiKeysFromCookie(cookieHeader);

  return (
    getFirstConfiguredValue(apiKeys, GITHUB_COOKIE_TOKEN_KEYS) ||
    getFirstConfiguredValue(context?.cloudflare?.env as Record<string, unknown> | undefined, GITHUB_ENV_TOKEN_KEYS) ||
    getFirstConfiguredValue(process.env as Record<string, unknown>, GITHUB_ENV_TOKEN_KEYS)
  );
}
