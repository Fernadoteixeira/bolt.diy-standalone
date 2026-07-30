import { describe, expect, it } from 'vitest';
import {
  getApiKeysFromRequest,
  getApiKeysFromRequestHeaders,
  getProviderSettingsFromRequest,
} from './request-credentials';

describe('request-credentials helpers', () => {
  it('reads api keys from X-Api-Keys header', () => {
    const headers = new Headers({
      'x-api-keys': encodeURIComponent(JSON.stringify({ openai: 'abc123' })),
    });

    expect(getApiKeysFromRequestHeaders(headers)).toEqual({ openai: 'abc123' });
  });

  it('prefers explicit headers over cookies', () => {
    const request = {
      headers: new Headers({
        Cookie:
          'apiKeys=%7B%22legacy%22%3A%22secret%22%7D; providers=%7B%22anthropic%22%3A%7B%22foo%22%3A%22bar%22%7D%7D',
        'x-api-keys': encodeURIComponent(JSON.stringify({ gemini: 'fresh-key' })),
        'x-provider-settings': encodeURIComponent(JSON.stringify({ anthropic: { region: 'us' } })),
      }),
    };

    expect(getApiKeysFromRequest(request)).toEqual({ gemini: 'fresh-key' });
    expect(getProviderSettingsFromRequest(request)).toEqual({ anthropic: { region: 'us' } });
  });

  it('falls back to cookie values when no headers are present', () => {
    const request = {
      headers: new Headers({
        Cookie:
          'apiKeys=%7B%22openai%22%3A%22cookie-key%22%7D; providers=%7B%22openai%22%3A%7B%22mode%22%3A%22fast%22%7D%7D',
      }),
    };

    expect(getApiKeysFromRequest(request)).toEqual({ openai: 'cookie-key' });
    expect(getProviderSettingsFromRequest(request)).toEqual({ openai: { mode: 'fast' } });
  });
});
