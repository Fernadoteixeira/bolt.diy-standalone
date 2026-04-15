import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { executeDatabaseQuery } from '~/lib/.server/database/client';
import { withSecurity } from '~/lib/security';

const FORBIDDEN_SQL_PATTERNS = [
  /\bdrop\s+database\b/i,
  /\bdrop\s+role\b/i,
  /\balter\s+system\b/i,
  /\bcopy\b[\s\S]*\bprogram\b/i,
];

async function databaseQueryAction({ request, context }: ActionFunctionArgs) {
  const payload = (await request.json()) as { query?: string; sql?: string };
  const query = (payload.query ?? payload.sql)?.replace(/;\s*$/, '');

  if (!query?.trim()) {
    return json({ error: 'SQL query is required' }, { status: 400 });
  }

  if (FORBIDDEN_SQL_PATTERNS.some((pattern) => pattern.test(query))) {
    return json({ error: 'Blocked unsafe SQL statement' }, { status: 400 });
  }

  try {
    const result = await executeDatabaseQuery(query, context?.cloudflare?.env);
    return json({ result });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Database query failed',
      },
      { status: 500 },
    );
  }
}

export const action = withSecurity(databaseQueryAction, {
  rateLimit: true,
  allowedMethods: ['POST'],
});
