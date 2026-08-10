/**
 * Mock provider settings fixtures for tests.
 *
 * These objects mirror the shape of the per-provider configuration that the
 * bolt.diy UI sends to the server via the `x-provider-settings` header.
 */

/**
 * Minimal settings for a single provider (OpenAI).
 */
export const singleProviderSettings: Record<string, unknown> = {
  openai: {
    model: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 4096,
  },
};

/**
 * Settings for multiple providers with varied configuration shapes.
 */
export const multiProviderSettings: Record<string, unknown> = {
  openai: {
    model: 'gpt-4o-mini',
    temperature: 0.5,
    maxTokens: 2048,
  },
  anthropic: {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.3,
    maxTokens: 8192,
    region: 'us',
  },
  google: {
    model: 'gemini-1.5-pro',
    temperature: 0.9,
    maxTokens: 8192,
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'llama3.2',
  },
  openrouter: {
    model: 'openrouter/auto',
    temperature: 0.7,
  },
};

/**
 * Empty provider settings (no configuration).
 */
export const emptyProviderSettings: Record<string, unknown> = {};

/**
 * Settings with only partial / sparse fields to test default-filling logic.
 */
export const sparseProviderSettings: Record<string, unknown> = {
  openai: {
    model: 'gpt-4o',
    // temperature and maxTokens intentionally omitted
  },
  anthropic: {
    // only temperature, no model
    temperature: 0.1,
  },
};

/**
 * Settings that include nested boolean and array fields, useful for testing
 * serialisation and deep-merge behaviour.
 */
export const complexProviderSettings: Record<string, unknown> = {
  openai: {
    model: 'gpt-4o',
    temperature: 0.7,
    streamOutput: true,
    systemPrompt: 'You are a helpful test assistant.',
    stopSequences: ['\n\nUser:', 'END'],
    tools: [
      { type: 'function', name: 'search', enabled: true },
      { type: 'function', name: 'code_run', enabled: false },
    ],
  },
};