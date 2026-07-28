import { vi } from 'vitest';

// Mock global fetch for all tests
global.fetch = vi.fn();

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  // Restore console after each test
  Object.assign(console, originalConsole);
});

// Helper to create mock fetch responses
export function mockFetchResponse(data: any, options?: { ok?: boolean; status?: number }) {
  (global.fetch as any).mockResolvedValue({
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Map(),
  });
}

export function mockFetchError(error: Error) {
  (global.fetch as any).mockRejectedValue(error);
}
