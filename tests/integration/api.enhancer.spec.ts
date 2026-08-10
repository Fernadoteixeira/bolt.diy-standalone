import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockRequest, mockApiKeyHeaders } from '~/lib/testing/test-helpers';
import { action } from '~/routes/api.enhancer';

// Mock the streamText module to avoid real LLM API calls
vi.mock('~/lib/.server/llm/stream-text', () => ({
  streamText: vi.fn(),
}));

import { streamText } from '~/lib/.server/llm/stream-text';

function createEnhancerRequest(body: unknown, headers?: Headers): Request {
  const merged = new Headers(headers);
  merged.set('x-user-role', 'user');
  const request = createMockRequest({
    method: 'POST',
    url: 'https://test.example.com/api/enhancer',
    body,
    headers: merged,
  });
  return request;
}

function makeMockStreamResult(text = 'enhanced prompt text') {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });

  return {
    textStream: stream,
    fullStream: (async function* () {
      yield { type: 'text', text };
    })(),
  };
}

describe('api.enhancer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 Response when model is missing', async () => {
    const request = createEnhancerRequest({
      message: 'hello',
      provider: { name: 'OpenAI' },
    });

    const response = await action({ request, context: { cloudflare: { env: {} } }, params: {} } as any);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(400);
  });

  it('returns 400 Response when model is not a string', async () => {
    const request = createEnhancerRequest({
      message: 'hello',
      model: 123,
      provider: { name: 'OpenAI' },
    });

    const response = await action({ request, context: { cloudflare: { env: {} } }, params: {} } as any);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(400);
  });

  it('returns 400 Response when provider is missing', async () => {
    const request = createEnhancerRequest({
      message: 'hello',
      model: 'gpt-4o',
      provider: {},
    });

    const response = await action({ request, context: { cloudflare: { env: {} } }, params: {} } as any);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(400);
  });

  it('returns 400 Response when provider.name is not a string', async () => {
    const request = createEnhancerRequest({
      message: 'hello',
      model: 'gpt-4o',
      provider: { name: 42 },
    });

    const response = await action({ request, context: { cloudflare: { env: {} } }, params: {} } as any);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(400);
  });

  it('returns 200 with text/event-stream on a valid request', async () => {
    vi.mocked(streamText).mockResolvedValue(makeMockStreamResult('enhanced prompt') as any);

    const headers = mockApiKeyHeaders({ OpenAI: 'sk-test-fake-key-aaaaaaaaaaaa' });
    const request = createEnhancerRequest(
      {
        message: 'make a button',
        model: 'gpt-4o',
        provider: { name: 'OpenAI' },
      },
      headers,
    );

    const response = await action({ request, context: { cloudflare: { env: {} } }, params: {} } as any);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    // Verify streamText was called
    expect(streamText).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(streamText).mock.calls[0][0] as any;
    expect(callArgs.messages).toBeDefined();
    expect(Array.isArray(callArgs.messages)).toBe(true);
    expect(callArgs.messages.length).toBe(1);
  });

  it('returns 401 Response when streamText throws an API key error', async () => {
    vi.mocked(streamText).mockRejectedValue(new Error('API key is invalid'));

    const headers = mockApiKeyHeaders({ OpenAI: 'sk-test-invalid-key' });
    const request = createEnhancerRequest(
      {
        message: 'make a button',
        model: 'gpt-4o',
        provider: { name: 'OpenAI' },
      },
      headers,
    );

    const response = await action({ request, context: { cloudflare: { env: {} } }, params: {} } as any);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(401);
  });

  it('returns 500 Response when streamText throws a generic error', async () => {
    vi.mocked(streamText).mockRejectedValue(new Error('Something went wrong'));

    const headers = mockApiKeyHeaders({ OpenAI: 'sk-test-fake-key-aaaaaaaaaaaa' });
    const request = createEnhancerRequest(
      {
        message: 'make a button',
        model: 'gpt-4o',
        provider: { name: 'OpenAI' },
      },
      headers,
    );

    const response = await action({ request, context: { cloudflare: { env: {} } }, params: {} } as any);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(500);
  });
});