import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authorizeRequest,
  clearAuditLog,
  clearRateLimits,
  generateCsrfToken,
  getAccessContext,
  getAuditLog,
  hasPermission,
  hasRole,
  issueCsrfToken,
  logAuditEvent,
  rotateSecret,
  validateCsrfToken,
  validateSecretStrength,
  withSecurity,
} from './security';

beforeEach(() => {
  clearAuditLog();
  clearRateLimits();
});

describe('security RBAC helpers', () => {
  it('resolves operator scope and permissions from headers', () => {
    const request = new Request('https://example.com/api', {
      headers: {
        'x-user-role': 'operator',
        'x-user-permissions': 'read:self,read:diagnostics',
      },
    });

    const access = getAccessContext(request);

    expect(access.role).toBe('operator');
    expect(access.permissions).toEqual(['read:self', 'read:diagnostics']);
    expect(hasRole(request, ['operator', 'admin'])).toBe(true);
    expect(hasPermission(request, 'read:diagnostics')).toBe(true);
  });

  it('denies access when the role or permission is missing', () => {
    const request = new Request('https://example.com/api', {
      headers: {
        'x-user-role': 'user',
      },
    });

    const deniedRoleResult = authorizeRequest(request, { roles: ['admin'] });
    const deniedPermissionResult = authorizeRequest(request, { permissions: ['read:diagnostics'] });

    expect(deniedRoleResult.allowed).toBe(false);
    expect(deniedRoleResult.reason).toBe('role-forbidden');
    expect(deniedPermissionResult.allowed).toBe(false);
    expect(deniedPermissionResult.reason).toBe('permission-forbidden');
  });

  it('returns 401 when auth is required but no identity headers are present', async () => {
    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withSecurity(handler, { requireAuth: true });

    const response = await wrapped({
      request: new Request('https://example.com/api'),
    } as any);

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 403 when the role is not allowed by the wrapper', async () => {
    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withSecurity(handler, { roles: ['admin'] });

    const response = await wrapped({
      request: new Request('https://example.com/api', {
        headers: {
          'x-user-role': 'user',
        },
      }),
    } as any);

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('CSRF token protection', () => {
  it('generateCsrfToken returns a non-empty hex string', () => {
    const token = generateCsrfToken();
    expect(token).toBeTruthy();
    expect(token.length).toBe(64); // 32 bytes hex-encoded = 64 chars
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it('generateCsrfToken produces unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateCsrfToken()));
    expect(tokens.size).toBe(100);
  });

  it('issueCsrfToken returns a token that validates against the store', () => {
    const token = issueCsrfToken();
    expect(token).toBeTruthy();

    const request = new Request('https://example.com/api', {
      headers: { 'x-csrf-token': token },
    });

    // validateCsrfToken compares against a known expected token
    expect(validateCsrfToken(request, token)).toBe(true);
  });

  it('validateCsrfToken returns true when the header matches the expected token', () => {
    const token = 'abcdef1234567890';

    const request = new Request('https://example.com/api', {
      headers: { 'x-csrf-token': token },
    });

    expect(validateCsrfToken(request, token)).toBe(true);
  });

  it('validateCsrfToken returns false when the header does not match', () => {
    const request = new Request('https://example.com/api', {
      headers: { 'x-csrf-token': 'wrong-token' },
    });

    expect(validateCsrfToken(request, 'expected-token')).toBe(false);
  });

  it('validateCsrfToken returns false when the header is missing', () => {
    const request = new Request('https://example.com/api');

    expect(validateCsrfToken(request, 'expected-token')).toBe(false);
  });

  it('validateCsrfToken returns false when expectedToken is empty', () => {
    const request = new Request('https://example.com/api', {
      headers: { 'x-csrf-token': 'some-token' },
    });

    expect(validateCsrfToken(request, '')).toBe(false);
  });

  it('withSecurity rejects requests without a CSRF token when csrf: true', async () => {
    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withSecurity(handler, { csrf: true });

    const response = await wrapped({
      request: new Request('https://example.com/api/csrf-test'),
    } as any);

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('withSecurity accepts requests with a valid CSRF token when csrf: true', async () => {
    const token = issueCsrfToken();
    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withSecurity(handler, { csrf: true, rateLimit: false });

    const response = await wrapped({
      request: new Request('https://example.com/api/csrf-valid', {
        headers: { 'x-csrf-token': token },
      }),
    } as any);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it('withSecurity rejects requests with an invalid CSRF token when csrf: true', async () => {
    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withSecurity(handler, { csrf: true, rateLimit: false });

    const response = await wrapped({
      request: new Request('https://example.com/api/csrf-invalid', {
        headers: { 'x-csrf-token': 'not-a-real-token' },
      }),
    } as any);

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('audit logging', () => {
  afterEach(() => {
    clearAuditLog();
  });

  it('logAuditEvent creates an entry with sensible defaults', () => {
    const entry = logAuditEvent({ action: 'test_event' });

    expect(entry.action).toBe('test_event');
    expect(entry.timestamp).toBeGreaterThan(0);
    expect(entry.userId).toBe('anonymous');
    expect(entry.role).toBe('unknown');
    expect(entry.path).toBe('');
    expect(entry.method).toBe('');
  });

  it('logAuditEvent preserves provided fields', () => {
    const entry = logAuditEvent({
      action: 'access_granted',
      userId: 'user123',
      role: 'admin',
      path: '/api/test',
      method: 'GET',
      details: { foo: 'bar' },
    });

    expect(entry.userId).toBe('user123');
    expect(entry.role).toBe('admin');
    expect(entry.path).toBe('/api/test');
    expect(entry.method).toBe('GET');
    expect(entry.details).toEqual({ foo: 'bar' });
  });

  it('getAuditLog returns all entries when no filter is provided', () => {
    logAuditEvent({ action: 'event_a' });
    logAuditEvent({ action: 'event_b' });

    const all = getAuditLog();
    expect(all.length).toBe(2);
  });

  it('getAuditLog filters by action', () => {
    logAuditEvent({ action: 'access_granted' });
    logAuditEvent({ action: 'access_denied' });
    logAuditEvent({ action: 'access_granted' });

    const granted = getAuditLog({ action: 'access_granted' });
    expect(granted.length).toBe(2);
    expect(granted.every((e) => e.action === 'access_granted')).toBe(true);
  });

  it('getAuditLog filters by userId', () => {
    logAuditEvent({ action: 'test', userId: 'alice' });
    logAuditEvent({ action: 'test', userId: 'bob' });
    logAuditEvent({ action: 'test', userId: 'alice' });

    const aliceEntries = getAuditLog({ userId: 'alice' });
    expect(aliceEntries.length).toBe(2);
    expect(aliceEntries.every((e) => e.userId === 'alice')).toBe(true);
  });

  it('getAuditLog filters by time range', () => {
    const before = Date.now();
    logAuditEvent({ action: 'old', timestamp: before - 10000 });
    logAuditEvent({ action: 'mid', timestamp: before });
    logAuditEvent({ action: 'new', timestamp: before + 10000 });

    const filtered = getAuditLog({ since: before - 5000, until: before + 5000 });
    expect(filtered.length).toBe(1);
    expect(filtered[0].action).toBe('mid');
  });

  it('clearAuditLog empties the log', () => {
    logAuditEvent({ action: 'event_a' });
    logAuditEvent({ action: 'event_b' });

    clearAuditLog();
    expect(getAuditLog().length).toBe(0);
  });

  it('withSecurity logs access_denied when auth is required but missing', async () => {
    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withSecurity(handler, { requireAuth: true });

    await wrapped({
      request: new Request('https://example.com/api/audit-auth'),
    } as any);

    const denied = getAuditLog({ action: 'access_denied' });
    expect(denied.length).toBe(1);
    expect(denied[0].details?.reason).toBe('auth-required');
  });

  it('withSecurity logs access_granted on successful request', async () => {
    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withSecurity(handler, { rateLimit: false });

    await wrapped({
      request: new Request('https://example.com/api/audit-granted'),
    } as any);

    const granted = getAuditLog({ action: 'access_granted' });
    expect(granted.length).toBe(1);
  });

  it('withSecurity logs csrf_failed when CSRF validation fails', async () => {
    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withSecurity(handler, { csrf: true, rateLimit: false });

    await wrapped({
      request: new Request('https://example.com/api/audit-csrf'),
    } as any);

    const failed = getAuditLog({ action: 'csrf_failed' });
    expect(failed.length).toBe(1);
  });

  it('withSecurity logs rate_limited when the rate limit is exceeded', async () => {
    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withSecurity(handler, {});

    // /api/llmcall has a limit of 10 requests per minute
    const endpoint = 'https://example.com/api/llmcall';

    let lastResponse: Response | undefined;

    // Send 11 requests to exceed the limit of 10
    for (let i = 0; i < 11; i++) {
      lastResponse = await wrapped({
        request: new Request(endpoint),
      } as any);
    }

    expect(lastResponse?.status).toBe(429);

    const limited = getAuditLog({ action: 'rate_limited' });

    expect(limited.length).toBeGreaterThanOrEqual(1);
  });

  it('audit log rotates when exceeding max size', () => {
    // Fill the log beyond the max size (1000)
    for (let i = 0; i < 1100; i++) {
      logAuditEvent({ action: 'bulk', userId: `user-${i}` });
    }

    const all = getAuditLog();
    expect(all.length).toBe(1000);

    // The oldest 100 entries should have been dropped
    expect(all[0].userId).toBe('user-100');
  });
});

describe('secret rotation helpers', () => {
  it('validateSecretStrength accepts a strong secret', () => {
    const result = validateSecretStrength('Abcdefgh123!@#XyzAbcdefgh123!@#Xyz');

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validateSecretStrength rejects a secret shorter than 32 characters', () => {
    const result = validateSecretStrength('Short1!a');

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Secret must be at least 32 characters long');
  });

  it('validateSecretStrength rejects a secret without an uppercase letter', () => {
    const result = validateSecretStrength('abcdef1234567890!@#$abcdef1234567890');

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Secret must contain at least one uppercase letter');
  });

  it('validateSecretStrength rejects a secret without a lowercase letter', () => {
    const result = validateSecretStrength('ABCDEF1234567890!@#$ABCDEF1234567890');

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Secret must contain at least one lowercase letter');
  });

  it('validateSecretStrength rejects a secret without a digit', () => {
    const result = validateSecretStrength('Abcdefgh!@#XyzAbcdefgh!@#XyzAbcd');

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Secret must contain at least one digit');
  });

  it('validateSecretStrength rejects a secret without a special character', () => {
    const result = validateSecretStrength('Abcdefgh1234567890XyzAbcdefgh1234');

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Secret must contain at least one special character');
  });

  it('rotateSecret succeeds with a valid old secret and a strong new secret', () => {
    const result = rotateSecret('old-secret-value-here', 'Abcdefgh123!@#XyzAbcdefgh123!@#Xyz');

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.oldSecretValid).toBe(true);
  });

  it('rotateSecret fails when the old secret is empty', () => {
    const result = rotateSecret('', 'Abcdefgh123!@#XyzAbcdefgh123!@#Xyz');

    expect(result.success).toBe(false);
    expect(result.oldSecretValid).toBe(false);
    expect(result.errors).toContain('Old secret is empty or invalid');
  });

  it('rotateSecret fails when the new secret is weak', () => {
    const result = rotateSecret('old-secret-value-here', 'weak');

    expect(result.success).toBe(false);
    expect(result.oldSecretValid).toBe(true);

    // Should contain strength errors
    expect(result.errors.some((e) => e.includes('32 characters'))).toBe(true);
  });
});
