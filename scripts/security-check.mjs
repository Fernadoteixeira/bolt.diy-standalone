/**
 * Basic, dependency-free security validation for CI.
 *
 * Run via: `pnpm run security:check` (or `node scripts/security-check.mjs`)
 *
 * Checks performed:
 *   1. Hardcoded-credentials scan — walks `app/` source files and flags lines
 *      that look like real API keys / tokens assigned to variables or embedded
 *      as string literals. Known placeholder/env references are ignored, and the
 *      security module itself is excluded (it intentionally contains key-format
 *      regexes for validation).
 *   2. Security module integrity — verifies that `app/lib/security.ts` exports
 *      the expected RBAC / CSRF / audit surface so downstream code can rely on it.
 *
 * Exits non-zero when any issue is found so CI quality gates fail fast.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const APP_DIR = join(ROOT, 'app');
const SECURITY_FILE = join(APP_DIR, 'lib', 'security.ts');

let failures = 0;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function logIssue(file, lineNo, message) {
  const rel = relative(ROOT, file);
  console.error(`  ✗ ${rel}:${lineNo}  ${message}`);
  failures++;
}

/** Recursively collect files under `dir` matching one of `exts`. */
function walk(dir, exts, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc; // directory missing — nothing to scan
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      // Skip noisy / non-source trees.
      if (entry === 'node_modules' || entry === 'dist' || entry === 'build') continue;
      walk(full, exts, acc);
    } else if (exts.some((e) => entry.endsWith(e))) {
      acc.push(full);
    }
  }
  return acc;
}

/* -------------------------------------------------------------------------- */
/*  1. Hardcoded-credentials scan                                              */
/* -------------------------------------------------------------------------- */

/**
 * Each entry is [label, regex]. The regex must capture the literal secret token
 * itself (group 1) so we can sanity-check its length before flagging — this
 * avoids matching short placeholder strings like `sk-test`.
 */
const SECRET_PATTERNS = [
  ['OpenAI key', /\b(sk-[A-Za-z0-9_-]{20,})\b/],
  ['Anthropic key', /\b(sk-ant-[A-Za-z0-9_-]{20,})\b/],
  ['OpenRouter key', /\b(sk-or-[A-Za-z0-9_-]{20,})\b/],
  ['AWS access key', /\b(AKIA[0-9A-Z]{16})\b/],
  ['GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{36,})\b/],
  ['Slack token', /\b(xox[baprs]-[A-Za-z0-9-]{20,})\b/],
  ['Google API key', /\b(AIza[0-9A-Za-z_-]{35})\b/],
  ['Generic secret assignment', /(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*["'`]([A-Za-z0-9+/=_-]{24,})["'`]/i],
];

// Files that legitimately contain key-format patterns or test fixtures.
const SCAN_EXCLUDES = new Set([join('app', 'lib', 'security.ts')]);

// Lines that are clearly safe (env lookups, placeholder strings, empty values).
const SAFE_LINE = /(?:process\.env|import\.meta\.env|sessionStorage|localStorage|YOUR_|REPLACE_|EXAMPLE|<|^\s*\*|\/\/)/;

function scanSecrets() {
  console.log('\n🔐 Scanning app/ for hardcoded credentials...');
  const files = walk(APP_DIR, ['.ts', '.tsx']);
  let found = 0;

  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (SCAN_EXCLUDES.has(rel)) continue;
    // Skip test/spec files — they may contain fixture tokens.
    if (/\.(spec|test)\.(ts|tsx)$/.test(rel)) continue;

    let lines;
    try {
      lines = readFileSync(file, 'utf8').split(/\r?\n/);
    } catch {
      continue;
    }

    lines.forEach((line, idx) => {
      if (SAFE_LINE.test(line)) return;
      for (const [label, regex] of SECRET_PATTERNS) {
        const m = line.match(regex);
        if (m && m[1] && m[1].length >= 20) {
          // Mask the secret in the report.
          const masked = `${m[1].slice(0, 6)}...${m[1].slice(-4)}`;
          logIssue(file, idx + 1, `possible hardcoded ${label} (${masked})`);
          found++;
          break; // one report per line
        }
      }
    });
  }

  if (found === 0) {
    console.log('  ✓ No hardcoded credentials detected in app/ source.');
  }
}

/* -------------------------------------------------------------------------- */
/*  2. Security module integrity                                               */
/* -------------------------------------------------------------------------- */

// Core surface that consumers rely on. Each entry is [name, kind] where kind is
// the keyword expected before the identifier (e.g. "function", "interface", or
// "type" — or "" for a bare `export { ... }` / `export const`).
const EXPECTED_EXPORTS = [
  ['UserRole', 'type'],
  ['AccessContext', 'interface'],
  ['checkRateLimit', 'function'],
  ['createSecurityHeaders', 'function'],
  ['validateApiKeyFormat', 'function'],
  ['sanitizeErrorMessage', 'function'],
  ['getAccessContext', 'function'],
  ['hasRole', 'function'],
  ['hasPermission', 'function'],
  ['authorizeRequest', 'function'],
  ['generateCsrfToken', 'function'],
  ['issueCsrfToken', 'function'],
  ['validateCsrfToken', 'function'],
  ['AuditEvent', 'interface'],
  ['logAuditEvent', 'function'],
  ['getAuditLog', 'function'],
  ['validateSecretStrength', 'function'],
  ['rotateSecret', 'function'],
  ['withSecurity', 'function'],
];

function checkSecurityExports() {
  console.log('\n🛡️  Verifying app/lib/security.ts exports...');

  let source;
  try {
    source = readFileSync(SECURITY_FILE, 'utf8');
  } catch {
    logIssue(SECURITY_FILE, 0, 'security.ts not found — RBAC/CSRF module is missing');
    return;
  }

  let missing = 0;
  for (const [name, kind] of EXPECTED_EXPORTS) {
    // Match `export <kind> name` (function/interface/type) or `export const name`.
    let re;
    if (kind) {
      re = new RegExp(`\\bexport\\s+${kind}\\s+${name}\\b`);
    } else {
      re = new RegExp(`\\bexport\\s+(?:const|let|var|\\{[^}]*\\b${name}\\b[^}]*\\})\\s*=??\\s*${name}\\b`);
    }
    if (!re.test(source)) {
      logIssue(SECURITY_FILE, 0, `missing expected export: ${kind ? kind + ' ' : ''}${name}`);
      missing++;
    }
  }

  if (missing === 0) {
    console.log(`  ✓ All ${EXPECTED_EXPORTS.length} expected security exports present.`);
  }
}

/* -------------------------------------------------------------------------- */
/*  Main                                                                       */
/* -------------------------------------------------------------------------- */

scanSecrets();
checkSecurityExports();

if (failures > 0) {
  console.error(`\n❌ security:check failed with ${failures} issue(s).`);
  process.exit(1);
}
console.log('\n✅ security:check passed.');