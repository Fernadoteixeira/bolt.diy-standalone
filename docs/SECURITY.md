# Security

This document covers every security control in bolt.diy-standalone, where it lives,
how to use it, and how to extend it. All primitives are centralized in
**`app/lib/security.ts`**; provider-secret handling lives in
**`app/lib/api/`**.

| Control             | Source file                        | Key exports |
|---------------------|------------------------------------|-------------|
| Provider secrets    | `app/lib/api/api-key-storage.ts`, `app/lib/api/request-credentials.ts` | `getApiKeysFromStorage`, `saveApiKeysToStorage`, `getApiKeysFromRequest`, `getProviderSettingsFromRequest` |
| RBAC                | `app/lib/security.ts`              | `getAccessContext`, `hasRole`, `hasPermission`, `authorizeRequest` |
| CSRF                | `app/lib/security.ts`              | `generateCsrfToken`, `issueCsrfToken`, `validateCsrfToken` |
| Audit logging       | `app/lib/security.ts`              | `logAuditEvent`, `getAuditLog`, `clearAuditLog` |
| Rate limiting       | `app/lib/security.ts`              | `checkRateLimit`, `clearRateLimits`, `RATE_LIMITS` |
| Security headers    | `app/lib/security.ts`              | `createSecurityHeaders` |
| Secret rotation     | `app/lib/security.ts`              | `validateSecretStrength`, `rotateSecret` |
| Route wrapper       | `app/lib/security.ts`              | `withSecurity` |
| Hardcoded-secret scan | `scripts/security-check.mjs`     | `pnpm run security:check` |

---

## Provider Secret Handling

### Threat model

API keys for LLM providers are end-user-supplied secrets. They must **never** be
persisted in cookies (which are sent on every request and leak via CSRF/referrer) nor
logged to the console or audit log.

### Storage: sessionStorage, not cookies

Client-side keys live in `window.sessionStorage` under the `bolt_api_keys` key as a
JSON `Record<provider, key>`. `sessionStorage` is scoped to the tab and cleared when it
closes — no long-lived persistence, no automatic transmission.

```ts
// app/lib/api/api-key-storage.ts
getApiKeysFromStorage(): Record<string, string>          // read + legacy migration
saveApiKeysToStorage(apiKeys: Record<string, string>)    // write + dispatch update event
clearApiKeysFromStorage()                                // wipe
```

A `bolt:api-keys-storage-updated` custom event is dispatched on every write so stores
can react.

### Legacy cookie migration

Older builds stored keys in an `apiKeys` cookie. `readLegacyCookie()` migrates these to
`sessionStorage` on first read and then clears the cookie
(`clearLegacyCookie()` sets `max-age=0`). After migration the cookie is never used again.

### Transmission: headers, not cookies

Server-side, credentials are read **only** from request headers via
`request-credentials.ts`:

```ts
// app/lib/api/request-credentials.ts
getApiKeysFromRequest(request, payload?): Record<string, string>
getProviderSettingsFromRequest(request, payload?): Record<string, any>
```

Resolution order (highest priority first):

1. `x-api-keys` / `x-provider-settings` headers — `encodeURIComponent(JSON.stringify(...))`.
2. Request body (`payload.apiKeys` / `payload.providerSettings`).
3. Cookies — legacy fallback only.

`api.llmcall.ts` uses exactly this helper, so all provider calls follow the same path.

### What never happens

- Keys are **not** written to `localStorage` (persists forever).
- Keys are **not** sent as cookies after migration.
- Keys are **not** logged. `sanitizeErrorMessage()` scrubs `API key` / `token` / `secret`
  substrings from any error surfaced to the client in production.

---

## RBAC Model

### Roles & permissions

```ts
type UserRole = 'user' | 'operator' | 'admin';

const ROLE_PERMISSIONS = {
  user:     ['read:self'],
  operator: ['read:self', 'read:diagnostics', 'read:metrics'],
  admin:    ['*', 'read:self', 'read:diagnostics', 'read:metrics', 'manage:users'],
};
```

The `admin` wildcard `*` matches any permission check.

### Identity headers

The access context is derived entirely from request headers (there is no server-side
session):

| Header                | Purpose                                  |
|-----------------------|------------------------------------------|
| `x-user-role`         | `user` \| `operator` \| `admin`           |
| `x-user-permissions`  | Comma-separated explicit permissions     |
| `x-user-id`           | User identifier (audit logs)             |
| `authorization`       | Counts as "authenticated" for `requireAuth`|

```ts
getAccessContext(request): AccessContext
hasRole(request, roles: UserRole[]): boolean
hasPermission(request, permission: string): boolean
authorizeRequest(request, { requireAuth?, roles?, permissions? }): {
  allowed: boolean;
  reason?: 'auth-required' | 'role-forbidden' | 'permission-forbidden';
  access: AccessContext;
}
```

`x-user-permissions`, when present, **overrides** the role's default permission set —
useful for fine-grained tokens. When absent, the role's `ROLE_PERMISSIONS` entry is used.

---

## CSRF Protection

CSRF tokens are 32-byte cryptographically random hex strings with a **1-hour TTL**,
stored in an in-memory `Map` (`csrfTokenStore`).

### Issue a token

```ts
import { issueCsrfToken } from '~/lib/security';

const token = issueCsrfToken();   // returns hex string, stores with TTL
```

### Validate a token

Clients send the token back via the `x-csrf-token` header.

```ts
// Validate against a known expected token (constant-time):
validateCsrfToken(request, expectedToken): boolean

// Internal: validate against the in-memory store (used by withSecurity):
validateCsrfTokenFromStore(request): boolean   // not exported
```

Comparison uses `timingSafeEqual` (`constantTimeCompare`) to prevent timing attacks.
Expired tokens are purged lazily on each issue/validate call
(`purgeExpiredCsrfTokens()`).

### Enabling CSRF on a route

Set `csrf: true` in the `withSecurity` options (see
[How to add a new secured API route](#how-to-add-a-new-secured-api-route)). On failure the
wrapper returns `403` with `{ error: true, message: 'Invalid or missing CSRF token' }`
and logs a `csrf_failed` audit event.

---

## Audit Logging

### What is logged

`logAuditEvent(event, level?)` appends a structured `AuditEvent` to an in-memory ring
buffer capped at **1000 entries** (oldest dropped first):

```ts
interface AuditEvent {
  timestamp: number;
  action: string;            // e.g. 'access_granted', 'access_denied', 'csrf_failed', 'rate_limited'
  userId: string;
  role: UserRole | 'unknown';
  path: string;
  method: string;
  details?: Record<string, unknown>;
}
```

The `withSecurity` wrapper emits these actions automatically:

| Action            | Level | When                                   |
|-------------------|-------|----------------------------------------|
| `access_granted`  | debug | All checks passed                      |
| `access_denied`   | warn  | Auth/role/permission/method check failed|
| `csrf_failed`     | warn  | CSRF token missing/invalid              |
| `rate_limited`    | warn  | Rate limit exceeded                    |

### Querying the log

```ts
import { getAuditLog, clearAuditLog } from '~/lib/security';

// All entries
getAuditLog();

// Filtered
getAuditLog({ action: 'access_denied', since: Date.now() - 60_000 });
getAuditLog({ userId: 'alice', until: Date.now() });
```

`clearAuditLog()` empties the buffer (use in tests only). The log is in-memory and
**resets on every serverless cold start** — it is an operational/forensic aid, not a
durable audit trail.

---

## Rate Limiting

### Configuration

Per-endpoint limits are declared in `RATE_LIMITS` inside `app/lib/security.ts`:

```ts
const RATE_LIMITS = {
  '/api/llmcall':      { windowMs: 60 * 1000,    maxRequests: 10 },   // 10/min
  '/api/github-*':     { windowMs: 60 * 1000,    maxRequests: 30 },   // 30/min
  '/api/netlify-*':    { windowMs: 60 * 1000,    maxRequests: 20 },   // 20/min
  '/api/*':            { windowMs: 15 * 60 * 1000, maxRequests: 100 }, // 100/15min
};
```

Matching: **exact match wins over wildcard** (`*` suffix). The client IP is resolved from
`cf-connecting-ip` → `x-real-ip` → `x-forwarded-for[0]` → `'unknown'`. The limit key is
`clientIP:endpoint`. When exceeded, the wrapper returns `429` with `Retry-After` and
`X-RateLimit-Reset` headers.

### How to add a new rate limit

1. Add an entry to `RATE_LIMITS` in `app/lib/security.ts`.
2. Use the exact path for specific endpoints, or `prefix*` for a group.
3. Ensure the route uses `withSecurity(handler, { rateLimit: true })` (the default).
   To **disable** rate limiting on a route: `withSecurity(handler, { rateLimit: false })`.

### Testing

`clearRateLimits()` resets the in-memory store — call it in `beforeEach` for rate-limit
tests so counts don't bleed across cases.

```ts
import { checkRateLimit, clearRateLimits } from '~/lib/security';

beforeEach(() => clearRateLimits());
```

---

## Security Headers

`createSecurityHeaders()` returns the full header set. `withSecurity` applies them to
every response.

| Header                        | Value                                                       | Why |
|-------------------------------|-------------------------------------------------------------|-----|
| `X-Frame-Options`             | `DENY`                                                      | Clickjacking |
| `X-Content-Type-Options`      | `nosniff`                                                   | MIME sniffing |
| `X-XSS-Protection`           | `1; mode=block`                                             | Reflected XSS (legacy browsers) |
| `Content-Security-Policy`     | `default-src 'self'; …`                                     | Resource loading allowlist |
| `Referrer-Policy`             | `strict-origin-when-cross-origin`                          | Referrer leakage |
| `Permissions-Policy`          | `camera=(), microphone=(), geolocation=(), payment=()`     | Disable unused browser features |
| `Strict-Transport-Security`   | `max-age=31536000; includeSubDomains; preload`             | HTTPS enforcement (**production only**) |

> The CSP allows `'unsafe-inline'`/`'unsafe-eval'` for scripts because Remix/Vite inject
> inline scripts. Tightening this requires nonces/hashes — a tracked follow-up.

---

## Secret Rotation

Two helpers validate and rotate application secrets (e.g. signing keys, admin tokens —
**not** end-user provider keys, which users rotate themselves via the UI).

### `validateSecretStrength(secret)`

Enforces a minimum strength policy:

- ≥ 32 characters
- ≥ 1 uppercase, 1 lowercase, 1 digit, 1 special character

```ts
import { validateSecretStrength } from '~/lib/security';

const result = validateSecretStrength(newSecret);
if (!result.valid) {
  throw new Error(`Weak secret: ${result.errors.join(', ')}`);
}
```

### `rotateSecret(oldSecret, newSecret)`

Validates the old secret is non-empty and the new secret meets strength requirements.
It returns a structured result and **does not perform the swap** — callers own storage.

```ts
import { rotateSecret } from '~/lib/security';

const result = rotateSecret(currentSecret, proposedSecret);
if (!result.success) {
  // result.errors, result.oldSecretValid
  return;
}
// caller persists newSecret to its secret store
```

---

## How to Add a New Secured API Route

Use the `withSecurity` wrapper. It wraps a Remix loader or action and applies all
controls in order: allowed-methods → CSRF → auth/role/permission → rate limit → handler
→ security headers → error sanitization.

### Signature

```ts
withSecurity<T>(handler: T, options?: {
  requireAuth?: boolean;
  rateLimit?: boolean;       // default true
  allowedMethods?: string[];
  roles?: UserRole[];
  permissions?: string[];
  csrf?: boolean;
}): T
```

### Example — POST endpoint, rate-limited, CSRF-protected, admin-only

```ts
// app/routes/api.admin-action.ts
import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';

async function adminAction({ request, context }: ActionFunctionArgs) {
  const payload = await request.json();
  // ... business logic ...
  return json({ ok: true });
}

export const action = withSecurity(adminAction, {
  allowedMethods: ['POST'],
  csrf: true,
  requireAuth: true,
  roles: ['admin'],
  permissions: ['manage:users'],
  rateLimit: true,
});
```

### Example — minimal GET loader (rate-limited, public)

```ts
// app/routes/api.health.ts
import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';

async function healthLoader({ request }: LoaderFunctionArgs) {
  return json({ status: 'healthy' });
}

export const loader = withSecurity(healthLoader, {
  allowedMethods: ['GET'],
});
```

### Failure responses

| Reason                 | Status | Body |
|------------------------|--------|------|
| method not allowed     | 405    | `'Method not allowed'` |
| auth required           | 401    | `{ error: true, message: 'Authentication required' }` |
| role/permission denied  | 403    | `{ error: true, message: 'Forbidden' }` |
| CSRF failed             | 403    | `{ error: true, message: 'Invalid or missing CSRF token' }` |
| rate limited            | 429    | `'Rate limit exceeded'` + `Retry-After` |
| handler throws          | 500    | `{ error: true, message: <sanitized> }` |

All failures emit an audit event (`access_denied` / `csrf_failed` / `rate_limited`).

---

## Local Security Validation

```bash
pnpm run security:check
```

Runs `scripts/security-check.mjs`, which:

1. **Scans `app/` for hardcoded credentials** — flags lines matching known key patterns
   (OpenAI `sk-…`, Anthropic `sk-ant-…`, GitHub `gh[pousr]_…`, AWS `AKIA…`, etc.).
   Spec files and `app/lib/security.ts` (which contains validation regexes) are excluded.
2. **Verifies `security.ts` exports the expected RBAC/CSRF/audit surface** — fails if any
   expected export is missing.

This runs in CI as the `security-audit` job in `.github/workflows/quality-gates.yml`,
alongside `pnpm audit --audit-level moderate`. Deeper SAST (CodeQL) and secret scanning
(Trivy) run in `.github/workflows/security.yaml`.