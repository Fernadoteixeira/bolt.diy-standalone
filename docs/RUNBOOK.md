# Operations Runbook

Procedures for operating and troubleshooting bolt.diy-standalone in production and
staging. For the controls themselves see [SECURITY.md](./SECURITY.md); for architecture
see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Security Incident Response

### If API keys are leaked

Provider API keys are end-user-supplied and stored in browser `sessionStorage` — they
never touch server-side storage or logs. A leak is therefore usually a **client-side**
event (e.g. a screenshot, a malicious browser extension, or a forwarded URL containing
a header value).

#### Response steps

1. **Contain** — the affected user must rotate the leaked key at the provider's console
   (links are surfaced in the app via each provider's `getApiKeyLink`, e.g.
   `https://console.anthropic.com/settings/keys`). The app cannot revoke a provider key
   on the user's behalf.
2. **Clear local state** — instruct the user to open the app's settings and click
   "Clear API keys" (calls `clearApiKeysFromStorage()`), or close the tab (sessionStorage
   is tab-scoped and cleared on close).
3. **Audit** — query the in-memory audit log for suspicious activity around the leak time.
   Note: the log is per-instance and resets on cold start, so query promptly.

   ```ts
   import { getAuditLog } from '~/lib/security';
   const around = getAuditLog({
     action: 'access_denied',
     since: Date.now() - 60 * 60 * 1000,   // last hour
   });
   ```

4. **Server-side secret rotation** — if a *server* secret was leaked (e.g. a
   `GITHUB_TOKEN` in `.env.local`, or a signing key), use the rotation helpers to
   validate the replacement before deploying:

   ```ts
   import { rotateSecret } from '~/lib/security';
   const result = rotateSecret(oldSecret, newSecret);
   if (!result.success) {
     // result.errors — do NOT deploy the new secret
   }
   ```
   Then update `.env.local` / the Cloudflare secret and redeploy. The old secret is
   invalid only after the provider revokes it.

5. **Post-incident** — run `pnpm run security:check` to confirm no hardcoded secrets
   were introduced, and review `pnpm audit --audit-level moderate`.

### If a CSRF token is suspected compromised

CSRF tokens are 32-byte random hex, 1-hour TTL, in-memory. They cannot be revoked
individually, but a cold start clears the entire `csrfTokenStore`. To invalidate all
outstanding tokens, restart the server (Workers: redeploy). New tokens are issued via
`issueCsrfToken()` on the next protected request.

---

## Rate Limit Tuning

Rate limits live in `RATE_LIMITS` inside `app/lib/security.ts`. The limiter is an
in-memory sliding window keyed by `clientIP:endpoint`.

### When to tune

- Users report `429` errors on legitimate usage → **raise** `maxRequests` or
  `windowMs` for that endpoint.
- An endpoint is being abused and the current limit is too permissive → **lower** it.
- A new endpoint needs its own budget → add a dedicated entry (exact path preferred
  over wildcard).

### How to change a limit

Edit the entry in `app/lib/security.ts`:

```ts
const RATE_LIMITS = {
  '/api/llmcall': { windowMs: 60 * 1000, maxRequests: 20 }, // was 10 — raise after spike
  // ...
};
```

Matching rules:
- **Exact path match wins over wildcard.** `/api/llmcall` beats `/api/*`.
- Wildcard entries use a trailing `*` (prefix match): `/api/github-*`.
- If no rule matches, the endpoint is **unlimited** (returns `{ allowed: true }`).

### Verifying in tests

```ts
import { checkRateLimit, clearRateLimits } from '~/lib/security';

beforeEach(() => clearRateLimits());

it('blocks the 11th request within the window', () => {
  const req = new Request('https://t/api/llmcall');
  for (let i = 0; i < 10; i++) {
    expect(checkRateLimit(req, '/api/llmcall').allowed).toBe(true);
  }
  expect(checkRateLimit(req, '/api/llmcall').allowed).toBe(false);
});
```

> ⚠️ The store is in-memory. In serverless/Workers deployments each isolate has its own
> store, so effective limits scale with the number of concurrent isolates. For strict
> distributed limits, back the store with KV/Durable Objects (not yet implemented).

---

## Audit Log Querying

The audit log is an in-memory ring buffer (max 1000 entries) in `app/lib/security.ts`.

### Query

```ts
import { getAuditLog } from '~/lib/security';

// Everything
getAuditLog();

// Denied access in the last 15 minutes
getAuditLog({
  action: 'access_denied',
  since: Date.now() - 15 * 60 * 1000,
});

// All actions by a specific user
getAuditLog({ userId: 'alice@example.com' });

// A specific time window
getAuditLog({ since: startTs, until: endTs });
```

### Actions recorded

| Action            | Level | Emitted by          |
|-------------------|-------|---------------------|
| `access_granted`  | debug | `withSecurity` (success) |
| `access_denied`   | warn  | `withSecurity` (auth/role/permission/method fail) |
| `csrf_failed`     | warn  | `withSecurity` (CSRF fail) |
| `rate_limited`    | warn  | `withSecurity` (429) |

Custom code can emit additional events via `logAuditEvent({ action: 'my_event', ... })`.

### Caveats

- **In-memory only** — the log is lost on cold start / isolate recycle. It is an
  operational aid, not a durable compliance trail. For durable audit, export entries
  to an external sink (not yet wired).
- **Capped at 1000 entries** — oldest entries are dropped under high load.

---

## CSRF Token Lifecycle Management

| Phase        | What happens |
|--------------|--------------|
| **Issue**    | `issueCsrfToken()` generates 32 random bytes (hex), stores with `expiresAt = now + 1h`, returns the token. |
| **Use**      | Client sends token in the `x-csrf-token` header on protected routes. |
| **Validate** | `withSecurity({ csrf: true })` calls `validateCsrfTokenFromStore()`: looks up the header token in the store, checks expiry, constant-time compares. |
| **Expire**   | `purgeExpiredCsrfTokens()` runs lazily on every issue/validate, removing entries past their `expiresAt`. |
| **Invalidate** | Restart the server / redeploy the Worker — the in-memory `csrfTokenStore` clears. |

There is no explicit "revoke single token" API. Tokens are single-use-per-session in
practice: clients request a fresh token for each state-changing flow.

### Operational notes

- TTL is `CSRF_TOKEN_TTL_MS = 60 * 60 * 1000` (1 hour) in `app/lib/security.ts`.
- If users report `403 Invalid or missing CSRF token`, either the token expired
  (instruct re-fetch) or the header isn't being sent (check the client fetch wrapper).
- Comparison is constant-time (`timingSafeEqual`) — no timing side-channel.

---

## Coverage Threshold Adjustment

Coverage thresholds are enforced by Vitest in `vitest.config.ts`:

```ts
coverage: {
  thresholds: {
    statements: 7,
    branches: 15,
    functions: 10,
    lines: 7,
  },
}
```

CI (`coverage` job) runs `pnpm run test:coverage` and Vitest exits non-zero if **any**
metric falls below its threshold.

### Raising thresholds as coverage improves

1. **Measure current coverage:**
   ```bash
   pnpm run test:coverage
   ```
   Read the summary table (or `coverage/coverage-summary.json`).

2. **Set new thresholds just below current values** — leave headroom so a small drop
   (e.g. a refactor) doesn't break CI. A common rule: set each threshold to
   `floor(current - 2)`.

3. **Edit `vitest.config.ts`** → `coverage.thresholds`. Update the comment block noting
   the target.

4. **Verify locally:**
   ```bash
   pnpm run test:coverage
   ```
   The summary must show each metric ≥ its threshold.

5. **Commit** — CI will enforce the new floor on all subsequent PRs.

### Lowering thresholds (avoid if possible)

Only lower a threshold when a legitimate, large refactor removed covered code without
removing its tests (rare). Document the reason in the commit message and restore the
threshold as soon as replacement coverage is added.

---

## CI Pipeline Troubleshooting

Pipeline: `.github/workflows/quality-gates.yml` (Wave 1: typecheck/lint/security-audit;
Wave 2: test/coverage/build).

### `typecheck` fails

```
error TS2307: Cannot find module '~/lib/...' or its corresponding type declarations
```
- Confirm the path alias `~/* → ./app/*` in `tsconfig.json` is intact.
- Ensure the imported file exists and exports the symbol. `tsc --noEmit` is strict —
  a missing `type` import on an interface will fail under `verbatimModuleSyntax: true`.
  Use `import type { ... }` for type-only imports.

### `lint` fails (warnings count as errors)

CI runs `eslint app --max-warnings 0`. To reproduce locally:

```bash
pnpm run lint --max-warnings 0
pnpm run lint:fix   # auto-fix what it can
```

### `security-audit` fails

Two sub-checks run:
1. **`pnpm run security:check`** — hardcoded-secret scan or a missing export in
   `app/lib/security.ts`. Read the job log for the file:line. If it's a false positive
   (a test fixture), the scanner already excludes `*.spec.ts` / `*.test.ts` — verify
   the flagged file isn't a non-test file with a placeholder.
2. **`pnpm audit --audit-level moderate`** — a dependency has a moderate+ advisory.
   Run `pnpm audit` locally, then `pnpm update <pkg>` (or pin a patched version) and
   commit the lockfile change.

### `test` or `coverage` fails

- **Test failure** — run `pnpm run test` locally; the failing spec is reported with a
  diff. Common causes: a store isn't reset in `beforeEach` (rate limits / audit log
  bleed across tests).
- **Coverage threshold missed** — `pnpm run test:coverage` prints the per-metric table.
  If a metric dropped below threshold after a refactor, either add tests for the new
  code or (temporarily) lower the threshold with a documented reason.

### `build` fails

```bash
pnpm run build
```
Vite/Remix build. Most build breaks are surfaced earlier by `typecheck`, but
asset/JSX errors can appear here. Check the build log for the failing module.

### Workflow not triggering

- `quality-gates.yml` runs on `push` to `main` and `pull_request` targeting `main`.
  PRs against other branches won't trigger it.
- `concurrency.cancel-in-progress: true` — a newer run on the same ref cancels older
  ones. If a run seems to disappear, check for a newer run that superseded it.

---

## Common Issues and Solutions

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `401 Authentication required` from an API route | `withSecurity({ requireAuth: true })` and no auth header sent | Send `authorization` or `x-user-role` header |
| `403 Forbidden` on a route that worked before | Role/permission changed, or `x-user-permissions` override removed a needed permission | Verify headers; check `ROLE_PERMISSIONS` in `security.ts` |
| `403 Invalid or missing CSRF token` | `csrf: true` set but client didn't send `x-csrf-token`, or token expired | Re-fetch a token via `issueCsrfToken()` and resend |
| `429 Rate limit exceeded` | In-memory limiter per isolate; bursts hit the cap | Raise `maxRequests` / `windowMs` for the endpoint, or stagger calls |
| API keys not persisting across reloads | Keys live in `sessionStorage` (tab-scoped, cleared on tab close) — this is intended | Re-enter keys in the UI; for long-lived sessions use `.env.local` server-side keys |
| Old `apiKeys` cookie still present after upgrade | Legacy migration only runs on first read from `sessionStorage` | Open the app once (triggers `readLegacyCookie` → `clearLegacyCookie`); or clear cookies manually |
| Tests fail intermittently with rate-limit errors | Rate-limit store not reset between tests | Add `beforeEach(() => clearRateLimits())` |
| Audit assertions flaky | Audit log accumulates across tests | Add `beforeEach(() => clearAuditLog())` |
| `pnpm install` resolves wrong versions | Not using the pinned pnpm 9.14.4 | `corepack enable` or `npm i -g pnpm@9.14.4` |
| Vite build slower than expected | `node_modules/.vite` cache cold/invalid | Delete `node_modules/.vite` and rebuild; CI caches are per-runner |
| Coverage gate fails after deleting code | Threshold floor now above actual coverage | Add tests for remaining code, or lower the threshold with a documented reason |