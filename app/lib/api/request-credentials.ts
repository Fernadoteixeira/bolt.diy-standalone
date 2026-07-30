import { getApiKeysFromCookie, getProviderSettingsFromCookie } from './cookies';

function parseJsonHeaderValue(headerValue: string | null): Record<string, any> | null {
  if (!headerValue) {
    return null;
  }

  try {
    const decodedValue = decodeURIComponent(headerValue);
    const parsedValue = JSON.parse(decodedValue);

    return parsedValue && typeof parsedValue === 'object' ? parsedValue : null;
  } catch {
    return null;
  }
}

export function getApiKeysFromRequestHeaders(headers: Headers | null | undefined): Record<string, string> | null {
  const headerValue = headers?.get('x-api-keys') ?? null;
  const parsedValue = parseJsonHeaderValue(headerValue);

  if (!parsedValue) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(parsedValue).filter(([, value]) => typeof value === 'string' && value.trim().length > 0),
  ) as Record<string, string>;
}

export function getProviderSettingsFromRequestHeaders(headers: Headers | null | undefined): Record<string, any> | null {
  const headerValue = headers?.get('x-provider-settings') ?? null;
  const parsedValue = parseJsonHeaderValue(headerValue);

  if (!parsedValue) {
    return null;
  }

  return parsedValue as Record<string, any>;
}

export function getApiKeysFromRequest(
  request: { headers: Headers | null | undefined },
  payload?: { apiKeys?: Record<string, string> },
): Record<string, string> {
  const headerApiKeys = getApiKeysFromRequestHeaders(request.headers);

  if (headerApiKeys && Object.keys(headerApiKeys).length > 0) {
    return headerApiKeys;
  }

  if (payload?.apiKeys && Object.keys(payload.apiKeys).length > 0) {
    return payload.apiKeys;
  }

  return getApiKeysFromCookie(request.headers?.get('Cookie') ?? null);
}

export function getProviderSettingsFromRequest(
  request: { headers: Headers | null | undefined },
  payload?: { providerSettings?: Record<string, any> },
): Record<string, any> {
  const headerProviderSettings = getProviderSettingsFromRequestHeaders(request.headers);

  if (headerProviderSettings && Object.keys(headerProviderSettings).length > 0) {
    return headerProviderSettings;
  }

  if (payload?.providerSettings && Object.keys(payload.providerSettings).length > 0) {
    return payload.providerSettings;
  }

  return getProviderSettingsFromCookie(request.headers?.get('Cookie') ?? null);
}
