import { describe, expect, it, vi } from 'vitest';
import { authorizeRequest, getAccessContext, hasPermission, hasRole, withSecurity } from './security';

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
