import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';
import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import { logger } from '~/utils/logger';

const COPILOT_BASE_URL = 'https://api.githubcopilot.com';

/**
 * Copilot API omits the `index` field from choices in some models (e.g. Claude).
 * The @ai-sdk/openai Zod schema requires `index: number` (not nullish), so we
 * normalise the response before it reaches the SDK parser.
 */
async function copilotNormalizeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);

  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    return response;
  }

  let text: string;

  try {
    text = await response.text();
  } catch {
    return response;
  }

  try {
    const json = JSON.parse(text) as Record<string, unknown>;

    if (Array.isArray(json.choices)) {
      json.choices = (json.choices as Record<string, unknown>[]).map((choice, i) =>
        typeof choice.index === 'number' ? choice : { index: i, ...choice },
      );
    }

    return new Response(JSON.stringify(json), {
      status: response.status,
      statusText: response.statusText,
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: { 'content-type': contentType },
    });
  }
}

/** Model categories that are not chat-completion capable */
const SKIP_CAPABILITIES = new Set(['embeddings']);

interface CopilotModelsResponse {
  data: Array<{
    id: string;
    name?: string;
    capabilities?: {
      type?: string;
      limits?: {
        max_prompt_tokens?: number;
        max_output_tokens?: number;
      };
    };
  }>;
}

export default class CopilotProvider extends BaseProvider {
  name = 'Copilot';
  getApiKeyLink = 'https://github.com/settings/copilot';
  labelForGetApiKey = 'Get GitHub Copilot access';
  icon = 'i-ph:github-logo';

  config = {
    apiTokenKey: 'GITHUB_API_KEY',
  };

  staticModels: ModelInfo[] = [];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv: Record<string, string> = {},
  ): Promise<ModelInfo[]> {
    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'GITHUB_API_KEY',
    });

    if (!apiKey) {
      logger.warn('Copilot: No GITHUB_API_KEY found.');
      return [];
    }

    try {
      const response = await fetch(`${COPILOT_BASE_URL}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: this.createTimeoutSignal(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const res = (await response.json()) as CopilotModelsResponse;

      return res.data
        .filter((model) => {
          const capType = model.capabilities?.type;
          return !capType || !SKIP_CAPABILITIES.has(capType);
        })
        .map((model) => ({
          name: model.id,
          label: model.name || model.id,
          provider: this.name,
          maxTokenAllowed: model.capabilities?.limits?.max_prompt_tokens ?? 128000,
          maxCompletionTokens: model.capabilities?.limits?.max_output_tokens ?? 16384,
        }));
    } catch (error) {
      logger.error('Copilot: Failed to fetch models:', error);
      return [];
    }
  }

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'GITHUB_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const openai = createOpenAI({
      baseURL: COPILOT_BASE_URL,
      apiKey,
      fetch: copilotNormalizeFetch,
    });

    return openai(model);
  }
}
