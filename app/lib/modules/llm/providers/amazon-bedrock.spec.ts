import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import AmazonBedrockProvider from '~/lib/modules/llm/providers/amazon-bedrock';

// cspell:words bedrock Bedrock

// Mock the Amazon Bedrock SDK so no real API client is created.
vi.mock('@ai-sdk/amazon-bedrock', () => ({
  createAmazonBedrock: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'amazon-bedrock' }))),
}));

describe('AmazonBedrockProvider', () => {
  let provider: AmazonBedrockProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AmazonBedrockProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static configuration', () => {
    it('should expose the provider name and API key link', () => {
      expect(provider.name).toBe('AmazonBedrock');
      expect(provider.getApiKeyLink).toBe('https://console.aws.amazon.com/iam/home');
    });

    it('should use AWS_BEDROCK_CONFIG as the API token key', () => {
      expect(provider.config.apiTokenKey).toBe('AWS_BEDROCK_CONFIG');
    });

    it('should include Claude 3.5 Sonnet v2, Nova Pro, and Mistral Large as static models', () => {
      const ids = provider.staticModels.map((m) => m.name);
      expect(ids).toContain('anthropic.claude-3-5-sonnet-20241022-v2:0');
      expect(ids).toContain('amazon.nova-pro-v1:0');
      expect(ids).toContain('mistral.mistral-large-2402-v1:0');
    });

    it('should set 200k context for Claude 3.5 Sonnet v2', () => {
      const model = provider.staticModels.find((m) => m.name === 'anthropic.claude-3-5-sonnet-20241022-v2:0');
      expect(model?.maxTokenAllowed).toBe(200000);
    });

    it('should set 4096 context for Claude 3.5 Sonnet v1, Claude 3 Sonnet, and Claude 3 Haiku', () => {
      const sonnetV1 = provider.staticModels.find((m) => m.name === 'anthropic.claude-3-5-sonnet-20240620-v1:0');
      const sonnet3 = provider.staticModels.find((m) => m.name === 'anthropic.claude-3-sonnet-20240229-v1:0');
      const haiku = provider.staticModels.find((m) => m.name === 'anthropic.claude-3-haiku-20240307-v1:0');
      expect(sonnetV1?.maxTokenAllowed).toBe(4096);
      expect(sonnet3?.maxTokenAllowed).toBe(4096);
      expect(haiku?.maxTokenAllowed).toBe(4096);
    });

    it('should set 5120 context for Amazon Nova Pro and Nova Lite', () => {
      const novaPro = provider.staticModels.find((m) => m.name === 'amazon.nova-pro-v1:0');
      const novaLite = provider.staticModels.find((m) => m.name === 'amazon.nova-lite-v1:0');
      expect(novaPro?.maxTokenAllowed).toBe(5120);
      expect(novaLite?.maxTokenAllowed).toBe(5120);
    });

    it('should set 8192 context for Mistral Large', () => {
      const mistral = provider.staticModels.find((m) => m.name === 'mistral.mistral-large-2402-v1:0');
      expect(mistral?.maxTokenAllowed).toBe(8192);
    });

    it('should set all static model providers to AmazonBedrock', () => {
      for (const model of provider.staticModels) {
        expect(model.provider).toBe('AmazonBedrock');
      }
    });
  });

  describe('getModelInstance', () => {
    const validConfig = JSON.stringify({
      region: 'us-east-1',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
    });

    it('should throw when no API key is configured', () => {
      expect(() =>
        provider.getModelInstance({
          model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          serverEnv: {} as any,
          apiKeys: {},
          providerSettings: {},
        }),
      ).toThrow('Missing API key for AmazonBedrock provider');
    });

    it('should throw when the API key is not valid JSON', () => {
      expect(() =>
        provider.getModelInstance({
          model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          serverEnv: {} as any,
          apiKeys: { AmazonBedrock: 'not-valid-json' },
          providerSettings: {},
        }),
      ).toThrow('Invalid AWS Bedrock configuration format');
    });

    it('should throw when region is missing from config', () => {
      const config = JSON.stringify({ accessKeyId: 'key', secretAccessKey: 'secret' });

      expect(() =>
        provider.getModelInstance({
          model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          serverEnv: {} as any,
          apiKeys: { AmazonBedrock: config },
          providerSettings: {},
        }),
      ).toThrow('Missing required AWS credentials');
    });

    it('should throw when accessKeyId is missing from config', () => {
      const config = JSON.stringify({ region: 'us-east-1', secretAccessKey: 'secret' });

      expect(() =>
        provider.getModelInstance({
          model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          serverEnv: {} as any,
          apiKeys: { AmazonBedrock: config },
          providerSettings: {},
        }),
      ).toThrow('Missing required AWS credentials');
    });

    it('should throw when secretAccessKey is missing from config', () => {
      const config = JSON.stringify({ region: 'us-east-1', accessKeyId: 'key' });

      expect(() =>
        provider.getModelInstance({
          model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          serverEnv: {} as any,
          apiKeys: { AmazonBedrock: config },
          providerSettings: {},
        }),
      ).toThrow('Missing required AWS credentials');
    });

    it('should return a model instance for the requested model', () => {
      const instance = provider.getModelInstance({
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        serverEnv: {} as any,
        apiKeys: { AmazonBedrock: validConfig },
        providerSettings: {},
      });

      expect(instance).toBeDefined();
      expect((instance as any).modelId).toBe('anthropic.claude-3-5-sonnet-20241022-v2:0');
    });

    it('should pass the parsed config to createAmazonBedrock', () => {
      provider.getModelInstance({
        model: 'amazon.nova-pro-v1:0',
        serverEnv: {} as any,
        apiKeys: { AmazonBedrock: validConfig },
        providerSettings: {},
      });

      expect(vi.mocked(createAmazonBedrock)).toHaveBeenCalledWith({
        region: 'us-east-1',
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
      });
    });

    it('should include sessionToken when provided in config', () => {
      const configWithSession = JSON.stringify({
        region: 'us-east-1',
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        sessionToken: 'test-session-token',
      });

      provider.getModelInstance({
        model: 'amazon.nova-pro-v1:0',
        serverEnv: {} as any,
        apiKeys: { AmazonBedrock: configWithSession },
        providerSettings: {},
      });

      expect(vi.mocked(createAmazonBedrock)).toHaveBeenCalledWith(
        expect.objectContaining({ sessionToken: 'test-session-token' }),
      );
    });

    it('should not include sessionToken when not provided in config', () => {
      provider.getModelInstance({
        model: 'amazon.nova-pro-v1:0',
        serverEnv: {} as any,
        apiKeys: { AmazonBedrock: validConfig },
        providerSettings: {},
      });

      const callArgs = vi.mocked(createAmazonBedrock).mock.calls[0][0] as any;
      expect(callArgs.sessionToken).toBeUndefined();
    });

    it('should resolve the API key from serverEnv when apiKeys is not provided', () => {
      provider.getModelInstance({
        model: 'amazon.nova-pro-v1:0',
        serverEnv: { AWS_BEDROCK_CONFIG: validConfig } as any,
        apiKeys: {},
        providerSettings: {},
      });

      expect(vi.mocked(createAmazonBedrock)).toHaveBeenCalledWith({
        region: 'us-east-1',
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
      });
    });
  });
});