const API_KEYS_STORAGE_KEY = 'bolt_api_keys';
export const API_KEYS_STORAGE_EVENT = 'bolt:api-keys-storage-updated';

const isBrowser = typeof window !== 'undefined';

function getStorage(): Storage | null {
  if (!isBrowser) {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readLegacyCookie(): Record<string, string> | null {
  if (!isBrowser) {
    return null;
  }

  const cookieValue = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('apiKeys='));

  if (!cookieValue) {
    return null;
  }

  try {
    const [, rawValue] = cookieValue.split('=');
    return rawValue ? JSON.parse(decodeURIComponent(rawValue)) : null;
  } catch {
    return null;
  }
}

function clearLegacyCookie() {
  if (!isBrowser) {
    return;
  }

  document.cookie = 'apiKeys=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

export function getApiKeysFromStorage(): Record<string, string> {
  const storage = getStorage();

  if (!storage) {
    return {};
  }

  try {
    const storedValue = storage.getItem(API_KEYS_STORAGE_KEY);

    if (storedValue) {
      const parsed = JSON.parse(storedValue);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
    }
  } catch {
    // Fall through to legacy cookie migration
  }

  const legacyApiKeys = readLegacyCookie();

  if (legacyApiKeys && Object.keys(legacyApiKeys).length > 0) {
    saveApiKeysToStorage(legacyApiKeys);
    clearLegacyCookie();
    return legacyApiKeys;
  }

  return {};
}

export function saveApiKeysToStorage(apiKeys: Record<string, string>) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  const normalizedApiKeys = Object.fromEntries(
    Object.entries(apiKeys).filter(([, value]) => typeof value === 'string' && value.trim().length > 0),
  );

  storage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(normalizedApiKeys));
  window.dispatchEvent(new CustomEvent(API_KEYS_STORAGE_EVENT, { detail: normalizedApiKeys }));
}

export function clearApiKeysFromStorage() {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.removeItem(API_KEYS_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(API_KEYS_STORAGE_EVENT, { detail: {} }));
}
