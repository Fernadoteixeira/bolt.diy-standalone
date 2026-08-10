# Architecture

This document describes the high-level architecture of **bolt.diy-standalone**: the
technology stack, project layout, request/data flow, security architecture, and test
strategy. It is intended for contributors who need a map of the codebase before making
changes.

> For day-to-day setup and workflows see [ONBOARDING.md](./ONBOARDING.md).
> For security controls see [SECURITY.md](./SECURITY.md).
> For operational procedures see [RUNBOOK.md](./RUNBOOK.md).

---

## Technology Stack

| Layer            | Technology                                                              |
|------------------|-------------------------------------------------------------------------|
| Framework        | [Remix](https://remix.run) (Cloudflare Pages adapter)                  |
| Bundler          | [Vite](https://vitejs.dev) 5.x                                          |
| UI               | React 18, Radix UI, Headless UI, Tailwind/UnoCSS, CodeMirror             |
| AI SDK           | [Vercel AI SDK](https://sdk.vercel.ai) (`ai` + `@ai-sdk/*` providers)   |
| State            | [nanostores](https://github.com/nanostores/nanostores) + `@nanostores/react` |
| Persistence      | IndexedDB (via local stores), sessionStorage (API keys), Electron store |
| Validation       | [zod](https://zod.dev)                                                  |
| Desktop          | Electron 33 (shared renderer build)                                     |
| Runtime targets  | Cloudflare Workers/Pages, Node (Electron), Docker                        |
| Test runner      | [Vitest](https://vitest.dev) 2.x (unit/integration), Playwright (e2e)   |
| Coverage         | `@vitest/coverage-v8` (v8 provider)                                      |
| Package manager  | pnpm 9.14.4 (`packageManager` field in `package.json`)                  |
| Node             | >= 18.18.0 (CI uses 20.18.0)                                            |

---

## Project Structure

Key directories and their responsibilities:

```
bolt.diy-standalone/
├── app/                      # Application source (Remix app)
│   ├── components/            # React UI components
│   ├── routes/               # Remix routes — file-based routing
│   │   └── api.*.ts           #   API route handlers (loaders/actions)
│   ├── lib/
│   │   ├── api/               # API-key storage + request-credential helpers
│   │   ├── modules/llm/       # LLM provider registry, base class, providers/
│   │   ├── persistence/       # IndexedDB/localStorage persistence layer
│   │   ├── .server/           # Server-only modules (llm, database, github, memory)
│   │   ├── services/          # Application services (github, gitlab, mcp, import/export…)
│   │   ├── stores/            # nanostores state stores
│   │   ├── security.ts        # RBAC, CSRF, audit logging, rate limiting, withSecurity
│   │   └── testing/           # Test helpers (createMockRequest, createMockResponse)
│   ├── utils/                 # Shared utilities (logger, path, terminal, diff…)
│   ├── types/                 # Shared TypeScript types
│   └── entry.{client,server}.tsx
├── electron/                  # Electron main + preload build configs
├── tests/
│   ├── fixtures/              # Mock data fixtures (api-keys, provider-settings…)
│   ├── integration/            # API route + service-flow integration tests
│   ├── e2e/                    # Playwright end-to-end tests
│   └── setup.ts                # Vitest global setup (mocks global fetch)
├── scripts/                    # Build/clean/security-check scripts
├── .github/workflows/          # CI pipelines (quality-gates, security, docker…)
├── vitest.config.ts            # Unit/integration test + coverage config
├── playwright.config.ts         # E2e test config
├── tsconfig.json               # TypeScript config (noEmit, ~/* → ./app/*)
├── vite.config.ts              # Vite build config
└── package.json
```

### Path aliases

`~/*` resolves to `./app/*` (see `tsconfig.json` → `paths`). Use `~/lib/...`,
`~/utils/...`, `~/components/...` consistently.

---

## Data Flow: Client → API Routes → LLM Providers

```
Browser (React UI)
   │
   │  1. User submits a chat prompt
   │     app/components → app/lib/stores/chat.ts
   ▼
Remix Action (POST /api/llmcall)
   │
   │  2. app/routes/api.llmcall.ts → llmCallAction()
   │     - parses JSON payload { system, message, model, provider, apiKeys?, providerSettings? }
   │     - resolves API keys/provider settings via request-credentials.ts:
   │         a. x-api-keys / x-provider-settings headers   ← preferred (sessionStorage-sent)
   │         b. payload.apiKeys / payload.providerSettings  ← fallback
   │         c. cookies                                      ← legacy migration only
   ▼
LLMManager (app/lib/modules/llm/manager.ts)
   │
   │  3. LLMManager.getInstance(env).getProvider(providerName)
   │     - singleton; providers auto-registered from registry.ts
   │     - each provider extends BaseProvider (base-provider.ts)
   ▼
Provider.getModelInstance({ model, apiKeys, providerSettings, serverEnv })
   │
   │  4. Resolves apiKey + baseUrl via getProviderBaseUrlAndKey()
   │     - env var (server) → apiKeys header (client) → default
   │     - constructs Vercel AI SDK client (e.g. createAnthropic, createOpenAI)
   ▼
Vercel AI SDK → streamText / generateText
   │
   │  5. Streams tokens back to the client
   ▼
Browser receives streamed response → renders in WebContainer/preview
```

### Key files in the flow

| Step | File |
|------|------|
| Client store | `app/lib/stores/chat.ts` |
| API entry    | `app/routes/api.llmcall.ts` |
| Credential resolution | `app/lib/api/request-credentials.ts` |
| API-key storage (client) | `app/lib/api/api-key-storage.ts` |
| Manager | `app/lib/modules/llm/manager.ts` |
| Provider base | `app/lib/modules/llm/base-provider.ts` |
| Provider registry | `app/lib/modules/llm/registry.ts` |
| Provider implementations | `app/lib/modules/llm/providers/*.ts` |
| Server-only LLM helpers | `app/lib/.server/llm/` |

### API key resolution order

`request-credentials.ts` resolves keys in this priority:

1. **`x-api-keys` / `x-provider-settings` headers** — sent from `sessionStorage` (never cookies).
2. **Request body** (`payload.apiKeys` / `payload.providerSettings`).
3. **Cookies** — legacy fallback only; values are migrated to `sessionStorage` and the cookie is cleared (`api-key-storage.ts:readLegacyCookie`).

---

## Security Architecture

All security primitives live in **`app/lib/security.ts`**. A short summary; full details
in [SECURITY.md](./SECURITY.md).

### Provider secrets

API keys are stored client-side in **`sessionStorage`** (`app/lib/api/api-key-storage.ts`)
and transmitted to the server via **`X-Api-Keys`** / **`X-Provider-Settings`** headers
(`app/lib/api/request-credentials.ts`). Cookies are used only for one-time migration from
older builds; the legacy `apiKeys` cookie is cleared on first read.

### RBAC

Three roles defined by `UserRole = 'user' | 'operator' | 'admin'` with a permission
matrix in `ROLE_PERMISSIONS`. Requests carry identity via headers:

- `x-user-role` — `user` | `operator` | `admin`
- `x-user-permissions` — comma-separated explicit permissions (overrides role defaults)
- `x-user-id` — used in audit logs

`authorizeRequest()` and the `withSecurity()` wrapper enforce auth/role/permission checks.

### CSRF

`issueCsrfToken()` mints a 32-byte random hex token (1-hour TTL, in-memory store).
Clients send it back via the `x-csrf-token` header. `validateCsrfToken()` uses
constant-time comparison (`timingSafeEqual`).

### Audit logging

`logAuditEvent()` appends structured `AuditEvent` records to an in-memory ring buffer
(capped at 1000 entries). `getAuditLog()` supports filtering by `action`, `userId`,
`since`, `until`.

### Rate limiting

In-memory sliding-window limiter keyed by `clientIP:endpoint`. Configured per-endpoint
in `RATE_LIMITS`; exact matches win over wildcard (`*`) matches.

### Security headers

`createSecurityHeaders()` returns CSP, `X-Frame-Options`, `X-Content-Type-Options`,
`X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`, and HSTS (production only).
The `withSecurity()` wrapper injects these on every response.

### withSecurity wrapper

`withSecurity(handler, options)` wraps a Remix loader/action and applies, in order:
allowed-methods check → CSRF → auth/role/permission → rate limit → handler → security
headers. See [SECURITY.md](./SECURITY.md#how-to-add-a-new-secured-api-route) for usage.

---

## Test Architecture

### Layers

| Layer        | Runner     | Config              | Location                  |
|--------------|------------|---------------------|---------------------------|
| Unit         | Vitest     | `vitest.config.ts`  | `app/**/*.spec.ts`, `tests/**/*.spec.ts` |
| Integration  | Vitest     | `vitest.config.ts`  | `tests/integration/`      |
| E2E          | Playwright | `playwright.config.ts` | `tests/e2e/`           |

Vitest runs in `node` environment with globals enabled. E2E tests are **excluded** from
the Vitest suite (`vitest.config.ts` → `exclude: ['**/tests/e2e/**']`) and run separately
via `pnpm test:e2e`.

### Test discovery

```
include: ['tests/**/*.spec.ts', 'app/**/*.spec.ts']
setupFiles: ['./tests/setup.ts']   # mocks global fetch, silences console noise
```

### Coverage

Coverage is computed by the v8 provider over `app/**/*.ts` and `app/**/*.tsx`
(test files, configs, `build/`, `electron/`, `scripts/` excluded). Enforced thresholds
are defined in `vitest.config.ts` → `coverage.thresholds`:

```ts
thresholds: {
  statements: 7,
  branches: 15,
  functions: 10,
  lines: 7,
}
```

These are intentionally conservative starting points — raise them as coverage grows
(see [RUNBOOK.md](./RUNBOOK.md#coverage-threshold-adjustment)).

### Test helpers & fixtures

- `app/lib/testing/test-helpers.ts` — `createMockRequest()`, `createMockResponse()`,
  header-encoding helpers matching the `x-api-keys` / `x-csrf-token` conventions.
- `tests/fixtures/` — `mock-api-keys.ts`, `mock-provider-settings.ts`,
  `mock-chat-messages.ts`. **All values are obviously fake.**
- `tests/setup.ts` — mocks `global.fetch`, provides `mockFetchResponse` /
  `mockFetchError`.

### CI pipeline

Quality gates live in `.github/workflows/quality-gates.yml` (two-wave pipeline):

- **Wave 1 (parallel, fast):** `typecheck`, `lint`, `security-audit`
- **Wave 2 (needs Wave 1):** `test`, `coverage`, `build`

Deeper SAST runs in `.github/workflows/security.yaml` (CodeQL + Trivy, weekly + on PR).
See [ONBOARDING.md](./ONBOARDING.md#ci-pipeline-overview) for the full overview.