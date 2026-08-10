import { json } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';

let execSync: ((cmd: string, opts: any) => string) | null = null;
let existsSync: ((path: string) => boolean) | null = null;

// Only import fs and child_process if we're not in a Cloudflare environment
try {
  if (typeof process !== 'undefined' && process.platform) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync: nodeExecSync } = require('node:child_process');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { existsSync: nodeExistsSync } = require('node:fs');
    execSync = nodeExecSync;
    existsSync = nodeExistsSync;
  }
} catch {
  console.log('Running in Cloudflare environment, fs and child_process not available');
  execSync = null;
  existsSync = null;
}

export const loader = withSecurity(
  async () => {
  try {
    // Check if we're in a git repository (only in Node.js environments)
    if (!execSync || !existsSync || !existsSync('.git')) {
      return json({
        branch: 'unknown',
        commit: 'unknown',
        isDirty: false,
      });
    }

    // Get current branch
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();

    // Get current commit hash
    const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

    // Check if working directory is dirty
    const statusOutput = execSync('git status --porcelain', { encoding: 'utf8' });
    const isDirty = statusOutput.trim().length > 0;

    // Get remote URL
    let remoteUrl: string | undefined;

    try {
      remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
    } catch {
      // No remote origin, leave as undefined
    }

    // Get last commit info
    let lastCommit: { message: string; date: string; author: string } | undefined;

    try {
      const commitInfo = execSync('git log -1 --pretty=format:"%s|%ci|%an"', { encoding: 'utf8' }).trim();
      const [message, date, author] = commitInfo.split('|');
      lastCommit = {
        message: message || 'unknown',
        date: date || 'unknown',
        author: author || 'unknown',
      };
    } catch {
      // Could not get commit info
    }

    return json({
      branch,
      commit,
      isDirty,
      remoteUrl,
      lastCommit,
    });
  } catch (error) {
    console.error('Error fetching git info:', error);
    return json(
      {
        branch: 'error',
        commit: 'error',
        isDirty: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
  },
  { allowedMethods: ['GET'], roles: ['operator', 'admin'], permissions: ['read:diagnostics'] },
);
