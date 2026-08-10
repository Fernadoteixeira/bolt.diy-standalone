import { json, type ActionFunction } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';

export const action: ActionFunction = withSecurity(
  async ({ request }) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  return json(
    {
      error: 'Updates must be performed manually in a server environment',
      instructions: [
        '1. Navigate to the project directory',
        '2. Run: git fetch upstream',
        '3. Run: git pull upstream main',
        '4. Run: pnpm install',
        '5. Run: pnpm run build',
      ],
    },
    { status: 400 },
  );
  },
  { allowedMethods: ['POST'], roles: ['admin'] },
);
