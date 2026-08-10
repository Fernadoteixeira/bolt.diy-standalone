import { describe, expect, it } from 'vitest';
import {
  createMockRequest,
  createMockResponse,
  mockApiKeyHeaders,
  mockAuthHeaders,
  mockCsrfHeaders,
  mockProviderSettingsHeaders,
} from './test-helpers';

describe('createMockRequest', () => {
  it('creates a GET request with default URL', () => {
    const request = createMockRequest();

    expect(request.method).toBe('GET');
    expect(request.url).toBe('https://test.example.com/api');
  });

  it('creates a POST request with a JSON body and content-type header', async () => {
    const request = createMockRequest({
      method: 'POST',
      body: { message: 'hello' },
    });

    expect(request.method).toBe('POST');
    expect(request.headers.get('Content-Type')).toBe('application/json');

    const body = await request.text();
    expect(JSON.parse(body)).toEqual({ message: 'hello' });
  });

  it('preserves explicit headers passed in', () => {
    const request = createMockRequest({
      headers: { 'x-custom-header': 'custom-value' },
    });

    expect(request.headers.get('x-custom-header')).toBe('custom-value');
  });

  it('accepts a Headers object directly', () => {
    const headers = new Headers({ 'x-custom': 'value' });
    const request = createMockRequest({ headers });

    expect(request.headers.get('x-custom')).toBe('value');
  });

  it('does not set Content-Type to application/json when jsonContentType is false', () => {
    const request = createMockRequest({
      method: 'POST',
      body: { msg: 'hi' },
      jsonContentType: false,
    });

    // The Request constructor may auto-add text/plain when a body is present,
    // but our helper must not force application/json when jsonContentType is false.
    expect(request.headers.get('Content-Type')).not.toContain('application/json');
  });

  it('does not override an existing Content-Type header', () => {
    const request = createMockRequest({
      method: 'POST',
      body: { msg: 'hi' },
      headers: { 'Content-Type': 'text/plain' },
    });

    expect(request.headers.get('Content-Type')).toBe('text/plain');
  });

  it('handles a string body without JSON-encoding it', async () => {
    const request = createMockRequest({
      method: 'POST',
      body: 'raw-text-body',
    });

    const body = await request.text();
    expect(body).toBe('raw-text-body');
  });
});

describe('createMockResponse', () => {
  it('captures a JSON response body', async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    const captured = await createMockResponse(response);

    expect(captured.status).toBe(200);
    expect(captured.ok).toBe(true);
    expect(captured.bodyJson).toEqual({ ok: true });
    expect(captured.bodyText).toBe(JSON.stringify({ ok: true }));
  });

  it('handles non-JSON response bodies gracefully', async () => {
    const response = new Response('plain text', { status: 201 });

    const captured = await createMockResponse(response);

    expect(captured.status).toBe(201);
    expect(captured.bodyText).toBe('plain text');
    expect(captured.bodyJson).toBeUndefined();
  });

  it('captures error status responses', async () => {
    const response = new Response(JSON.stringify({ error: 'bad request' }), {
      status: 400,
      statusText: 'Bad Request',
    });

    const captured = await createMockResponse(response);

    expect(captured.ok).toBe(false);
    expect(captured.status).toBe(400);
    expect(captured.statusText).toBe('Bad Request');
    expect(captured.bodyJson).toEqual({ error: 'bad request' });
  });

  it('accepts a Promise that resolves to a Response', async () => {
    const captured = await createMockResponse(
      Promise.resolve(new Response(JSON.stringify({ async: true }), { status: 200 })),
    );

    expect(captured.bodyJson).toEqual({ async: true });
  });

  it('preserves the original response reference', async () => {
    const response = new Response('ok');
    const captured = await createMockResponse(response);

    expect(captured.response).toBe(response);
  });

  it('handles an empty response body', async () => {
    const response = new Response('', { status: 200 });
    const captured = await createMockResponse(response);

    expect(captured.bodyText).toBe('');
    expect(captured.bodyJson).toBeUndefined();
  });
});

describe('mockApiKeyHeaders', () => {
  it('creates headers with a URL-encoded JSON x-api-keys value', () => {
    const headers = mockApiKeyHeaders({ openai: 'sk-test-xxxxx' });

    const raw = headers.get('x-api-keys');
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(decodeURIComponent(raw!));
    expect(parsed).toEqual({ openai: 'sk-test-xxxxx' });
  });

  it('encodes multiple provider keys', () => {
    const headers = mockApiKeyHeaders({
      openai: 'sk-test-aaaaa',
      anthropic: 'sk-ant-test-bbbb',
    });

    const parsed = JSON.parse(decodeURIComponent(headers.get('x-api-keys')!));
    expect(Object.keys(parsed)).toHaveLength(2);
    expect(parsed.openai).toBe('sk-test-aaaaa');
    expect(parsed.anthropic).toBe('sk-ant-test-bbbb');
  });

  it('only sets the x-api-keys header', () => {
    const headers = mockApiKeyHeaders({ openai: 'sk-test-xxxxx' });
    const keys: string[] = [];

    headers.forEach((_, key) => keys.push(key));

    expect(keys).toEqual(['x-api-keys']);
  });
});

describe('mockProviderSettingsHeaders', () => {
  it('creates headers with a URL-encoded JSON x-provider-settings value', () => {
    const headers = mockProviderSettingsHeaders({ anthropic: { region: 'us' } });

    const raw = headers.get('x-provider-settings');
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(decodeURIComponent(raw!));
    expect(parsed).toEqual({ anthropic: { region: 'us' } });
  });

  it('handles nested settings objects', () => {
    const headers = mockProviderSettingsHeaders({
      openai: { model: 'gpt-4', temperature: 0.7 },
      cohere: { model: 'command-r' },
    });

    const parsed = JSON.parse(decodeURIComponent(headers.get('x-provider-settings')!));
    expect(parsed.openai).toEqual({ model: 'gpt-4', temperature: 0.7 });
    expect(parsed.cohere).toEqual({ model: 'command-r' });
  });
});

describe('mockAuthHeaders', () => {
  it('sets x-user-role header', () => {
    const headers = mockAuthHeaders('admin');

    expect(headers.get('x-user-role')).toBe('admin');
  });

  it('sets x-user-permissions header when permissions are provided', () => {
    const headers = mockAuthHeaders('operator', ['read:self', 'read:diagnostics']);

    expect(headers.get('x-user-role')).toBe('operator');
    expect(headers.get('x-user-permissions')).toBe('read:self,read:diagnostics');
  });

  it('does not set x-user-permissions when permissions array is omitted', () => {
    const headers = mockAuthHeaders('user');

    expect(headers.get('x-user-permissions')).toBeNull();
  });

  it('does not set x-user-permissions when permissions array is empty', () => {
    const headers = mockAuthHeaders('user', []);

    expect(headers.get('x-user-permissions')).toBeNull();
  });
});

describe('mockCsrfHeaders', () => {
  it('sets x-csrf-token with the provided token', () => {
    const headers = mockCsrfHeaders('my-csrf-token');

    expect(headers.get('x-csrf-token')).toBe('my-csrf-token');
  });

  it('uses a default fake token when none is provided', () => {
    const headers = mockCsrfHeaders();

    const token = headers.get('x-csrf-token');
    expect(token).not.toBeNull();
    expect(token).toContain('fake');
  });

  it('only sets the x-csrf-token header', () => {
    const headers = mockCsrfHeaders('token-123');
    const keys: string[] = [];

    headers.forEach((_, key) => keys.push(key));

    expect(keys).toEqual(['x-csrf-token']);
  });
});