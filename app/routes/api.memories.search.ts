import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { searchRelevantMemories } from '~/lib/.server/memory/service';
import { withSecurity } from '~/lib/security';

async function memorySearchAction({ request, context }: ActionFunctionArgs) {
  const { query, limit } = (await request.json()) as { query?: string; limit?: number };

  if (!query?.trim()) {
    return json({ results: [] });
  }

  const results = await searchRelevantMemories(query, {
    limit: limit ?? 8,
    env: context?.cloudflare?.env,
  });

  return json({ results });
}

export const action = withSecurity(memorySearchAction, {
  rateLimit: true,
  allowedMethods: ['POST'],
});
