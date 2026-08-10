# Developer Onboarding

Everything you need to go from a fresh clone to a running dev server, passing tests,
and shipping a change. For architecture see [ARCHITECTURE.md](./ARCHITECTURE.md); for
security see [SECURITY.md](./SECURITY.md); for operations see [RUNBOOK.md](./RUNBOOK.md).

---

## Prerequisites

| Tool        | Version     | Notes                                                   |
|-------------|-------------|---------------------------------------------------------|
| Node.js     | ≥ 18.18.0   | CI uses 20.18.0 — match it locally to avoid surprises  |
| pnpm        | 9.14.4      | Enforced via `packageManager` in `package.json`        |
| Git         | any recent  |                                                         |
| (optional) Docker | recent | For the local-LLM / persistence stack                    |

Verify:

```bash
node --version
pnpm --version
```

> The repo pins pnpm via the `packageManager` field. If you have corepack enabled,
> `corepack enable` will pick up the right version automatically.

---

## Setup

```bash
# 1. Clone
git clone https://github.com/boldsbrainai/bolt.diy-standalone.git
cd bolt.diy-standalone

# 2. Install dependencies (respects pnpm-lock.yaml)
pnpm install

# 3. Configure environment
cp .env.example .env.local
#   edit .env.local and add the API keys you want to use

# 4. Start the dev server (runs pre-start.cjs first)
pnpm run dev
```

The app is served at `http://localhost:5173` by default.

### Environment variables

- `.env.local` — your local API keys and provider base URLs. Copy from `.env.example`.
- Provider keys can also be entered via the in-app settings UI; they are stored in
  `sessionStorage` (see [SECURITY.md → Provider Secret Handling](./SECURITY.md#provider-secret-handling)).
- Server-only secrets (e.g. `GITHUB_TOKEN`, `NETLIFY_TOKEN`) should go in `.env.local`
  and are read via `import.meta.env` / `process.env` on the server.

### Electron desktop

```bash
pnpm run electron:dev          # dev with hot reload
pnpm run electron:build:dist   # build distributable for current OS
```

---

## Running Tests

### Unit & integration tests (Vitest)

```bash
pnpm run test            # run once
pnpm run test:watch      # watch mode
pnpm run test:ui         # browser UI
pnpm run test:unit       # excludes tests/e2e/** explicitly
```

### Coverage

```bash
pnpm run test:coverage
```

Opens `coverage/index.html`. Thresholds are enforced in `vitest.config.ts`
(`coverage.thresholds`) — Vitest exits non-zero if any metric falls below. Current
conservative floor: statements 7%, branches 15%, functions 10%, lines 7%.
See [RUNBOOK.md → Coverage threshold adjustment](./RUNBOOK.md#coverage-threshold-adjustment)
to raise them.

### End-to-end tests (Playwright)

```bash
pnpm run test:e2e                 # runs tests/e2e/** against BASE_URL (default :5173)
BASE_URL=http://localhost:3000 pnpm run test:e2e
```

E2E tests are **excluded** from the Vitest suite — they run only via Playwright.

### Test helpers

```ts
import { createMockRequest, createMockResponse } from '~/lib/testing/test-helpers';

const request = createMockRequest({
  method: 'POST',
  url: 'https://test.example/api/llmcall',
  body: { message: 'hi' },
  headers: { 'x-csrf-token': 'test-token' },
});

const captured = await createMockResponse(routeHandler({ request }));
expect(captured.status).toBe(200);
expect(captured.bodyJson).toEqual({ ok: true });
```

Fixtures live in `tests/fixtures/` (`mock-api-keys.ts`, `mock-provider-settings.ts`,
`mock-chat-messages.ts`). **Never put real credentials in fixtures.**

---

## Linting and Type Checking

```bash
pnpm run typecheck    # tsc --noEmit (strict mode)
pnpm run lint         # ESLint over app/ (zero-warnings enforced in CI)
pnpm run lint:fix     # ESLint --fix + Prettier write
pnpm run security:check   # hardcoded-secret scan + security module integrity
```

CI runs `pnpm run lint --max-warnings 0` — any warning fails the gate.

---

## CI Pipeline Overview

`.github/workflows/quality-gates.yml` — two-wave pipeline on every push to `main` and
every PR targeting `main`:

```
Wave 1 (parallel, fast)          Wave 2 (needs Wave 1, heavier)
┌──────────────┐                 ┌──────────────────┐
│ typecheck    │                 │ test  (unit)     │
│ lint         │  ── all pass ─▶ │ coverage         │
│ security-audit│                │ build            │
└──────────────┘                 └──────────────────┘
```

| Job             | Command                          | Fails when |
|-----------------|----------------------------------|------------|
| typecheck       | `tsc --noEmit`                   | any TS error |
| lint            | `eslint app --max-warnings 0`    | any warning/error |
| security-audit  | `security:check` + `pnpm audit`  | hardcoded secret / moderate+ vuln |
| test            | `pnpm run test`                  | any test fails |
| coverage        | `pnpm run test:coverage`         | threshold missed |
| build           | `pnpm run build`                 | build fails |

Coverage + build artifacts are uploaded for 14 / 3 days respectively.

A separate **Security Analysis** workflow (`.github/workflows/security.yaml`) runs
CodeQL (JS/TS) and Trivy secret scanning on PRs and weekly via cron.

---

## Project Structure Guide

See [ARCHITECTURE.md → Project Structure](./ARCHITECTURE.md#project-structure) for the
full tree. The short version:

- **`app/routes/`** — Remix file-based routes. `api.*.ts` files are API endpoints
  (export `loader` for GET, `action` for POST/mutations).
- **`app/lib/modules/llm/`** — LLM provider system (`manager.ts`, `base-provider.ts`,
  `registry.ts`, `providers/*.ts`).
- **`app/lib/security.ts`** — All security primitives (RBAC, CSRF, audit, rate limit,
  `withSecurity`).
- **`app/lib/api/`** — Provider secret storage + request credential resolution.
- **`app/lib/stores/`** — nanostores state stores.
- **`app/lib/services/`** — Cross-cutting services (github, gitlab, mcp, import/export).
- **`app/utils/`** — Shared pure utilities (most have co-located `.spec.ts`).
- **`tests/`** — `integration/`, `e2e/`, `fixtures/`, `setup.ts`.

Path alias: `~/*` → `./app/*`.

---

## How to Add a New LLM Provider

1. **Create the provider class** in `app/lib/modules/llm/providers/<name>.ts`,
   extending `BaseProvider`:

   ```ts
   import { createOpenAI } from '@ai-sdk/openai';
   import type { LanguageModelV1 } from 'ai';
   import { BaseProvider } from '~/lib/modules/llm/base-provider';
   import type { ModelInfo } from '~/lib/modules/llm/types';

   export default class MyProvider extends BaseProvider {
     name = 'MyProvider';
     getApiKeyLink = 'https://example.com/keys';
     config = { apiTokenKey: 'MY_API_KEY' };

     staticModels: ModelInfo[] = [
       { name: 'model-1', label: 'Model 1', provider: 'MyProvider', maxTokenAllowed: 128000 },
     ];

     getModelInstance = (options) => {
       const { apiKey } = this.getProviderBaseUrlAndKey({
         apiKeys: options.apiKeys,
         providerSettings: options.providerSettings,
         serverEnv: options.serverEnv as any,
         defaultApiTokenKey: 'MY_API_KEY',
       });
       const client = createOpenAI({ apiKey, baseURL: 'https://api.example.com/v1' });
       return client(options.model);
     };
   }
   ```

2. **Register it** in `app/lib/modules/llm/registry.ts`:
   - Add `import MyProvider from './providers/<name>';`
   - Re-export it from the `export { ... }` block.

   The `LLMManager` auto-discovers providers exported from `registry.ts` and registers
   any class that `extends BaseProvider` — you do **not** need to touch `manager.ts`.

3. **Add a spec** (`providers/<name>.spec.ts`) — follow the pattern in
   `anthropic.spec.ts` / `groq.spec.ts` (test `staticModels` shape and
   `getModelInstance` construction with mock keys).

4. **(Optional) Add the env key** to `.env.example` and document it in the README
   provider list.

---

## How to Add a New API Route

Remix uses file-based routing under `app/routes/`. An API route is a file named
`api.<name>.ts` that exports a `loader` (GET) and/or `action` (POST/mutation).

```ts
// app/routes/api.my-thing.ts
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';

async function myThingLoader({ request, context }: LoaderFunctionArgs) {
  return json({ ok: true });
}

async function myThingAction({ request }: ActionFunctionArgs) {
  const payload = await request.json();
  // ... business logic ...
  return json({ created: true });
}

export const loader = withSecurity(myThingLoader, { allowedMethods: ['GET'] });
export const action = withSecurity(myThingAction, {
  allowedMethods: ['POST'],
  csrf: true,
  requireAuth: true,
  rateLimit: true,
});
```

Always wrap exports with `withSecurity` — it injects security headers, rate limiting,
audit logging, and optional RBAC/CSRF. See
[SECURITY.md → How to add a new secured API route](./SECURITY.md#how-to-add-a-new-secured-api-route)
for the full options reference.

---

## How to Add a New Test

### Unit test (co-located with source)

Create `app/<dir>/<file>.spec.ts` next to the module. Vitest auto-discovers `*.spec.ts`
under `app/` and `tests/`.

```ts
// app/utils/myUtil.spec.ts
import { describe, it, expect } from 'vitest';
import { myUtil } from './myUtil';

describe('myUtil', () => {
  it('does the thing', () => {
    expect(myUtil('x')).toBe('y');
  });
});
```

### Integration test (API route)

Place under `tests/integration/`. Use the test helpers to build a mock request and
capture the response:

```ts
// tests/integration/api.my-thing.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '~/lib/testing/test-helpers';
import { loader } from '~/routes/api.my-thing';

describe('GET /api/my-thing', () => {
  it('returns ok', async () => {
    const request = createMockRequest({ method: 'GET', url: 'https://t/api/my-thing' });
    const res = await createMockResponse(loader({ request, context: {} } as any));
    expect(res.status).toBe(200);
    expect(res.bodyJson).toEqual({ ok: true });
  });
});
```

### Conventions

- Name files `<subject>.spec.ts` (Vitest `include` globs match `*.spec.ts`).
- For rate-limit tests, call `clearRateLimits()` in `beforeEach`.
- For audit-log assertions, call `clearAuditLog()` in `beforeEach`.
- Keep fixtures in `tests/fixtures/` — never inline real-looking secrets.
- `tests/setup.ts` mocks `global.fetch`; use `mockFetchResponse` / `mockFetchError`
  from the setup file when you need to stub network calls.