import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';

export type UserRole = 'user' | 'operator' | 'admin';

export interface AccessContext {
  role: UserRole;
  permissions: string[];
  isAuthenticated: boolean;
}

const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  user: ['read:self'],
  operator: ['read:self', 'read:diagnostics', 'read:metrics'],
  admin: ['*', 'read:self', 'read:diagnostics', 'read:metrics', 'manage:users'],
};

// Rate limiting store (in-memory for serverless environments)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Rate limit configuration
const RATE_LIMITS = {
  // LLM API (more restrictive)
  '/api/llmcall': { windowMs: 60 * 1000, maxRequests: 10 }, // 10 requests per minute

  // GitHub API endpoints (matches /api/github-stats, /api/github/user, etc.)
  '/api/github*': { windowMs: 60 * 1000, maxRequests: 30 }, // 30 requests per minute

  // Netlify API endpoints (matches /api/netlify-deploy, /api/netlify/user, etc.)
  '/api/netlify*': { windowMs: 60 * 1000, maxRequests: 20 }, // 20 requests per minute

  // Vercel API endpoints
  '/api/vercel*': { windowMs: 60 * 1000, maxRequests: 20 }, // 20 requests per minute

  // GitLab API endpoints
  '/api/gitlab*': { windowMs: 60 * 1000, maxRequests: 30 }, // 30 requests per minute

  // General API endpoints
  '/api/*': { windowMs: 15 * 60 * 1000, maxRequests: 100 }, // 100 requests per 15 minutes
};

/** Clear all rate limit entries (useful for testing). */
export function clearRateLimits(): void {
  rateLimitStore.clear();
}

/**
 * Rate limiting middleware
 */
export function checkRateLimit(request: Request, endpoint: string): { allowed: boolean; resetTime?: number } {
  const clientIP = getClientIP(request);
  const key = `${clientIP}:${endpoint}`;

  // Find matching rate limit rule: prefer exact matches first, then wildcard matches
  const exactRule = Object.entries(RATE_LIMITS).find(([pattern]) => pattern === endpoint);

  const wildcardRule = Object.entries(RATE_LIMITS).find(([pattern]) => {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return endpoint.startsWith(prefix);
    }

    return false;
  });

  const rule = exactRule || wildcardRule;

  if (!rule) {
    return { allowed: true }; // No rate limit for this endpoint
  }

  const [, config] = rule;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Clean up old entries
  for (const [storedKey, data] of rateLimitStore.entries()) {
    if (data.resetTime < windowStart) {
      rateLimitStore.delete(storedKey);
    }
  }

  // Get or create rate limit data
  const rateLimitData = rateLimitStore.get(key) || { count: 0, resetTime: now + config.windowMs };

  if (rateLimitData.count >= config.maxRequests) {
    return { allowed: false, resetTime: rateLimitData.resetTime };
  }

  // Update rate limit data
  rateLimitData.count++;
  rateLimitStore.set(key, rateLimitData);

  return { allowed: true };
}

/**
 * Get client IP address from request
 */
function getClientIP(request: Request): string {
  // Try various headers that might contain the real IP
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const cfConnectingIP = request.headers.get('cf-connecting-ip');

  // Return the first available IP or a fallback
  return cfConnectingIP || realIP || forwardedFor?.split(',')[0]?.trim() || 'unknown';
}

/**
 * Security headers middleware
 */
export function createSecurityHeaders() {
  return {
    // Prevent clickjacking
    'X-Frame-Options': 'DENY',

    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',

    // Enable XSS protection
    'X-XSS-Protection': '1; mode=block',

    // Content Security Policy - restrict to same origin and trusted sources
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Allow inline scripts for React
      "style-src 'self' 'unsafe-inline'", // Allow inline styles
      "img-src 'self' data: https: blob:", // Allow images from same origin, data URLs, and HTTPS
      "font-src 'self' data:", // Allow fonts from same origin and data URLs
      "connect-src 'self' https://api.github.com https://api.netlify.com", // Allow connections to GitHub and Netlify APIs
      "frame-src 'none'", // Prevent iframe embedding
      "object-src 'none'", // Prevent object embedding
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),

    // Referrer Policy
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Permissions Policy (formerly Feature Policy)
    'Permissions-Policy': ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()'].join(', '),

    // HSTS (HTTP Strict Transport Security) - only in production
    ...(process.env.NODE_ENV === 'production'
      ? {
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        }
      : {}),
  };
}

/**
 * Validate API key format (basic validation)
 */
export function validateApiKeyFormat(apiKey: string, provider: string): boolean {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  // Basic length checks for different providers
  const minLengths: Record<string, number> = {
    anthropic: 50,
    openai: 50,
    groq: 50,
    google: 30,
    github: 30,
    netlify: 30,
  };

  const minLength = minLengths[provider.toLowerCase()] || 20;

  return apiKey.length >= minLength && !apiKey.includes('your_') && !apiKey.includes('here');
}

/**
 * Sanitize error messages to prevent information leakage
 */
export function sanitizeErrorMessage(error: unknown, isDevelopment = false): string {
  if (isDevelopment) {
    // In development, show full error details
    return error instanceof Error ? error.message : String(error);
  }

  // In production, show generic messages to prevent information leakage
  if (error instanceof Error) {
    // Check for sensitive information in error messages
    if (error.message.includes('API key') || error.message.includes('token') || error.message.includes('secret')) {
      return 'Authentication failed';
    }

    if (error.message.includes('rate limit') || error.message.includes('429')) {
      return 'Rate limit exceeded. Please try again later.';
    }
  }

  return 'An unexpected error occurred';
}

function normalizePermissions(rawPermissions: string | null | undefined): string[] {
  if (!rawPermissions) {
    return [];
  }

  return rawPermissions
    .split(',')
    .map((permission) => permission.trim())
    .filter(Boolean);
}

export function getAccessContext(request: Request): AccessContext {
  const roleHeader = request.headers.get('x-user-role') || request.headers.get('X-User-Role');
  const role = (roleHeader === 'operator' || roleHeader === 'admin' ? roleHeader : 'user') as UserRole;
  const permissionsHeader = request.headers.get('x-user-permissions');
  const explicitPermissions = normalizePermissions(permissionsHeader);
  const permissions = explicitPermissions.length > 0 ? explicitPermissions : ROLE_PERMISSIONS[role];

  return {
    role,
    permissions,
    isAuthenticated: Boolean(roleHeader || permissionsHeader || request.headers.get('authorization')),
  };
}

export function hasRole(request: Request, roles: UserRole[]): boolean {
  const { role } = getAccessContext(request);
  return roles.includes(role);
}

export function hasPermission(request: Request, permission: string): boolean {
  const { permissions } = getAccessContext(request);
  return permissions.includes('*') || permissions.includes(permission);
}

export function authorizeRequest(
  request: Request,
  options: {
    requireAuth?: boolean;
    roles?: UserRole[];
    permissions?: string[];
  } = {},
): { allowed: boolean; reason?: 'auth-required' | 'role-forbidden' | 'permission-forbidden'; access: AccessContext } {
  const access = getAccessContext(request);

  if (options.requireAuth && !access.isAuthenticated) {
    return { allowed: false, reason: 'auth-required', access };
  }

  if (options.roles && options.roles.length > 0 && !hasRole(request, options.roles)) {
    return { allowed: false, reason: 'role-forbidden', access };
  }

  if (options.permissions && options.permissions.length > 0) {
    const hasAllPermissions = options.permissions.every((permission) => hasPermission(request, permission));

    if (!hasAllPermissions) {
      return { allowed: false, reason: 'permission-forbidden', access };
    }
  }

  return { allowed: true, access };
}

/*
 * ---------------------------------------------------------------------------
 * CSRF Token Protection
 * ---------------------------------------------------------------------------
 */

/** CSRF token TTL in milliseconds (1 hour). */
const CSRF_TOKEN_TTL_MS = 60 * 60 * 1000;

/** In-memory store of issued CSRF tokens with expiry. */
const csrfTokenStore = new Map<string, { token: string; expiresAt: number }>();

/**
 * Generate a cryptographically random CSRF token.
 * Returns a hex-encoded string suitable for use in headers.
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Issue a new CSRF token: generate, store with TTL, and return it.
 * The client should send this token back via the `x-csrf-token` header.
 */
export function issueCsrfToken(): string {
  purgeExpiredCsrfTokens();

  const token = generateCsrfToken();
  csrfTokenStore.set(token, { token, expiresAt: Date.now() + CSRF_TOKEN_TTL_MS });

  return token;
}

/**
 * Validate a CSRF token from the request against an expected token using
 * constant-time comparison to prevent timing attacks.
 *
 * Reads the token from the `x-csrf-token` header on the request.
 * Returns `true` only when the header is present and matches the expected token.
 */
export function validateCsrfToken(request: Request, expectedToken: string): boolean {
  const headerToken = request.headers.get('x-csrf-token');

  if (!headerToken || !expectedToken) {
    return false;
  }

  return constantTimeCompare(headerToken, expectedToken);
}

/**
 * Validate a CSRF token from the request against the in-memory token store.
 * Used internally by the `withSecurity` wrapper when `csrf: true` is set.
 */
function validateCsrfTokenFromStore(request: Request): boolean {
  purgeExpiredCsrfTokens();

  const headerToken = request.headers.get('x-csrf-token');

  if (!headerToken) {
    return false;
  }

  const entry = csrfTokenStore.get(headerToken);

  if (!entry || entry.expiresAt < Date.now()) {
    return false;
  }

  return validateCsrfToken(request, entry.token);
}

/** Remove expired CSRF tokens from the store. */
function purgeExpiredCsrfTokens(): void {
  const now = Date.now();

  for (const [key, entry] of csrfTokenStore.entries()) {
    if (entry.expiresAt < now) {
      csrfTokenStore.delete(key);
    }
  }
}

/**
 * Constant-time string comparison to mitigate timing attacks.
 * Returns `false` immediately (but safely) when lengths differ.
 */
function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/*
 * ---------------------------------------------------------------------------
 * Audit Logging
 * ---------------------------------------------------------------------------
 */

/** Maximum number of audit entries retained in the in-memory buffer. */
const AUDIT_LOG_MAX_SIZE = 1000;

export interface AuditEvent {
  timestamp: number;
  action: string;
  userId: string;
  role: UserRole | 'unknown';
  path: string;
  method: string;
  details?: Record<string, unknown>;
}

export interface AuditLogQuery {
  action?: string;
  userId?: string;
  since?: number;
  until?: number;
}

/** In-memory rotating audit log buffer. */
const auditLog: AuditEvent[] = [];

/**
 * Record a structured audit event. Missing fields are filled with sensible
 * defaults. The buffer is capped at `AUDIT_LOG_MAX_SIZE` entries (oldest
 * entries are dropped when the cap is reached).
 *
 * @param event - Partial audit event; `timestamp` defaults to now.
 * @param level - Optional log level for console emission ('debug' | 'warn').
 */
export function logAuditEvent(event: Partial<AuditEvent>, level: 'debug' | 'warn' = 'debug'): AuditEvent {
  const entry: AuditEvent = {
    timestamp: event.timestamp ?? Date.now(),
    action: event.action ?? 'unknown',
    userId: event.userId ?? 'anonymous',
    role: event.role ?? 'unknown',
    path: event.path ?? '',
    method: event.method ?? '',
    details: event.details,
  };

  auditLog.push(entry);

  // Rotate: drop oldest entries when exceeding max size
  while (auditLog.length > AUDIT_LOG_MAX_SIZE) {
    auditLog.shift();
  }

  if (level === 'warn') {
    console.warn(`[audit] ${entry.action} — ${entry.method} ${entry.path} user=${entry.userId} role=${entry.role}`);
  } else {
    console.debug(`[audit] ${entry.action} — ${entry.method} ${entry.path} user=${entry.userId} role=${entry.role}`);
  }

  return entry;
}

/**
 * Retrieve audit log entries with optional filtering.
 *
 * @param options - Optional filters: `action`, `userId`, `since` (timestamp),
 *                  `until` (timestamp).
 * @returns Array of matching `AuditEvent` entries (oldest first).
 */
export function getAuditLog(options?: AuditLogQuery): AuditEvent[] {
  if (!options) {
    return [...auditLog];
  }

  return auditLog.filter((entry) => {
    if (options.action !== undefined && entry.action !== options.action) {
      return false;
    }

    if (options.userId !== undefined && entry.userId !== options.userId) {
      return false;
    }

    if (options.since !== undefined && entry.timestamp < options.since) {
      return false;
    }

    if (options.until !== undefined && entry.timestamp > options.until) {
      return false;
    }

    return true;
  });
}

/** Clear all audit log entries. */
export function clearAuditLog(): void {
  auditLog.length = 0;
}

/*
 * ---------------------------------------------------------------------------
 * Secret Rotation Helpers
 * ---------------------------------------------------------------------------
 */

export interface SecretStrengthResult {
  valid: boolean;
  errors: string[];
}

export interface SecretRotationResult {
  success: boolean;
  errors: string[];
  oldSecretValid: boolean;
}

/**
 * Validate that a secret meets minimum strength requirements:
 * - At least 32 characters
 * - Contains at least one uppercase letter
 * - Contains at least one lowercase letter
 * - Contains at least one digit
 * - Contains at least one special character
 */
export function validateSecretStrength(secret: string): SecretStrengthResult {
  const errors: string[] = [];

  if (typeof secret !== 'string' || secret.length < 32) {
    errors.push('Secret must be at least 32 characters long');
  }

  if (!/[A-Z]/.test(secret)) {
    errors.push('Secret must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(secret)) {
    errors.push('Secret must contain at least one lowercase letter');
  }

  if (!/\d/.test(secret)) {
    errors.push('Secret must contain at least one digit');
  }

  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(secret)) {
    errors.push('Secret must contain at least one special character');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Rotate a secret from `oldSecret` to `newSecret`.
 *
 * Validates that the old secret is non-empty and that the new secret meets
 * minimum strength requirements. Returns a structured result without
 * performing the actual swap (callers manage storage).
 */
export function rotateSecret(oldSecret: string, newSecret: string): SecretRotationResult {
  const errors: string[] = [];

  const oldSecretValid = typeof oldSecret === 'string' && oldSecret.length > 0;

  if (!oldSecretValid) {
    errors.push('Old secret is empty or invalid');
  }

  const strength = validateSecretStrength(newSecret);

  if (!strength.valid) {
    errors.push(...strength.errors);
  }

  return {
    success: errors.length === 0,
    errors,
    oldSecretValid,
  };
}

/*
 * ---------------------------------------------------------------------------
 * Internal helpers used by withSecurity
 * ---------------------------------------------------------------------------
 */

/** Extract a user identifier from request headers, defaulting to 'anonymous'. */
function getUserIdFromRequest(request: Request): string {
  return request.headers.get('x-user-id') || 'anonymous';
}

/**
 * Security wrapper for API routes
 */
export function withSecurity<T extends (args: ActionFunctionArgs | LoaderFunctionArgs) => Promise<Response>>(
  handler: T,
  options: {
    requireAuth?: boolean;
    rateLimit?: boolean;
    allowedMethods?: string[];
    roles?: UserRole[];
    permissions?: string[];
    csrf?: boolean;
  } = {},
) {
  return async (args: ActionFunctionArgs | LoaderFunctionArgs): Promise<Response> => {
    const { request } = args;
    const url = new URL(request.url);
    const endpoint = url.pathname;
    const userId = getUserIdFromRequest(request);
    const accessContext = getAccessContext(request);

    // Check allowed methods
    if (options.allowedMethods && !options.allowedMethods.includes(request.method)) {
      logAuditEvent(
        {
          action: 'access_denied',
          userId,
          role: accessContext.role,
          path: endpoint,
          method: request.method,
          details: { reason: 'method-not-allowed' },
        },
        'warn',
      );

      return new Response('Method not allowed', {
        status: 405,
        headers: createSecurityHeaders(),
      });
    }

    // CSRF token validation (optional, enabled with `csrf: true`)
    if (options.csrf) {
      if (!validateCsrfTokenFromStore(request)) {
        logAuditEvent(
          {
            action: 'csrf_failed',
            userId,
            role: accessContext.role,
            path: endpoint,
            method: request.method,
          },
          'warn',
        );

        return new Response(JSON.stringify({ error: true, message: 'Invalid or missing CSRF token' }), {
          status: 403,
          headers: {
            ...createSecurityHeaders(),
            'Content-Type': 'application/json',
          },
        });
      }
    }

    if (options.requireAuth || options.roles || options.permissions) {
      const accessResult = authorizeRequest(request, options);

      if (!accessResult.allowed) {
        const status = accessResult.reason === 'auth-required' ? 401 : 403;
        const message = accessResult.reason === 'auth-required' ? 'Authentication required' : 'Forbidden';

        logAuditEvent(
          {
            action: 'access_denied',
            userId,
            role: accessContext.role,
            path: endpoint,
            method: request.method,
            details: { reason: accessResult.reason },
          },
          'warn',
        );

        return new Response(JSON.stringify({ error: true, message }), {
          status,
          headers: {
            ...createSecurityHeaders(),
            'Content-Type': 'application/json',
          },
        });
      }
    }

    // Apply rate limiting
    if (options.rateLimit !== false) {
      const rateLimitResult = checkRateLimit(request, endpoint);

      if (!rateLimitResult.allowed) {
        logAuditEvent(
          {
            action: 'rate_limited',
            userId,
            role: accessContext.role,
            path: endpoint,
            method: request.method,
            details: { resetTime: rateLimitResult.resetTime },
          },
          'warn',
        );

        return new Response('Rate limit exceeded', {
          status: 429,
          headers: {
            ...createSecurityHeaders(),
            'Retry-After': Math.ceil((rateLimitResult.resetTime! - Date.now()) / 1000).toString(),
            'X-RateLimit-Reset': rateLimitResult.resetTime!.toString(),
          },
        });
      }
    }

    // All security checks passed — log successful access (debug level)
    logAuditEvent(
      {
        action: 'access_granted',
        userId,
        role: accessContext.role,
        path: endpoint,
        method: request.method,
      },
      'debug',
    );

    try {
      // Execute the handler
      const response = await handler(args);

      // Add security headers to response
      const responseHeaders = new Headers(response.headers);
      Object.entries(createSecurityHeaders()).forEach(([key, value]) => {
        responseHeaders.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      // If the handler threw a Response (common Remix pattern for error responses),
      // return it as-is with security headers added instead of converting to 500
      if (error instanceof Response) {
        const responseHeaders = new Headers(error.headers);
        Object.entries(createSecurityHeaders()).forEach(([key, value]) => {
          responseHeaders.set(key, value);
        });
        return new Response(error.body, {
          status: error.status,
          statusText: error.statusText,
          headers: responseHeaders,
        });
      }

      console.error('Security-wrapped handler error:', error);

      const errorMessage = sanitizeErrorMessage(error, process.env.NODE_ENV === 'development');

      return new Response(
        JSON.stringify({
          error: true,
          message: errorMessage,
        }),
        {
          status: 500,
          headers: {
            ...createSecurityHeaders(),
            'Content-Type': 'application/json',
          },
        },
      );
    }
  };
}
