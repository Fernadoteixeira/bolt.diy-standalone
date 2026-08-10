/**
 * Mock API key fixtures for tests.
 *
 * IMPORTANT: All keys in this file are obviously fake and must never be used
 * against real providers. They follow a `sk-test-*` / `sk-ant-test-*` pattern
 * to be instantly recognisable as non-production values.
 */

/**
 * A single-provider API key map (OpenAI).
 */
export const singleProviderApiKeys: Record<string, string> = {
  openai: 'sk-test-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
};

/**
 * A multi-provider API key map covering common providers.
 */
export const multiProviderApiKeys: Record<string, string> = {
  openai: 'sk-test-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  anthropic: 'sk-ant-test-bbbbbbbbbbbbbbbbbbbbbbbbbb',
  google: 'AIza-test-ccccccccccccccccccccccccccccc',
  mistral: 'sk-test-mistral-ddddddddddddddddddddddddd',
  cohere: 'co-test-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  deepseek: 'sk-test-deepseek-ffffffffffffffffffffffffff',
  groq: 'gsk-test-groq-1111111111111111111111111',
  openrouter: 'sk-or-test-openrouter-2222222222222222',
};

/**
 * An empty API key map (no keys configured).
 */
export const emptyApiKeys: Record<string, string> = {};

/**
 * An API key map with an empty-string value to test edge cases.
 */
export const partialEmptyApiKeys: Record<string, string> = {
  openai: 'sk-test-valid-key-3333333333333333333333',
  anthropic: '',
};

/**
 * A large API key map with many providers for stress / iteration tests.
 */
export const manyProviderApiKeys: Record<string, string> = {
  openai: 'sk-test-openai-aaa',
  anthropic: 'sk-ant-test-anthropic-bbb',
  google: 'AIza-test-google-ccc',
  mistral: 'sk-test-mistral-ddd',
  cohere: 'co-test-cohere-eee',
  deepseek: 'sk-test-deepseek-fff',
  groq: 'gsk-test-groq-ggg',
  openrouter: 'sk-or-test-openrouter-hhh',
  fireworks: 'fw-test-fireworks-iii',
  cerebras: 'cs-test-cerebras-jjj',
  xai: 'xai-test-xai-kkk',
  together: 'tog-test-together-lll',
  perplexity: 'pplx-test-perplexity-mmm',
  github: 'ghp_test-github-nnn',
  ollama: '',
};