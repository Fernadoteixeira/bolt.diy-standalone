import { json } from '@remix-run/cloudflare';
import { getApiKeysFromRequest, getProviderSettingsFromRequest } from '~/lib/api/request-credentials';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';
import { withSecurity } from '~/lib/security';

interface ModelsResponse {
  modelList: ModelInfo[];
  providers: ProviderInfo[];
  defaultProvider: ProviderInfo;
}

let cachedProviders: ProviderInfo[] | null = null;

function getProviderInfo(llmManager: LLMManager) {
  if (!cachedProviders) {
    cachedProviders = llmManager.getAllProviders().map((provider) => ({
      name: provider.name,
      staticModels: provider.staticModels,
      getApiKeyLink: provider.getApiKeyLink,
      labelForGetApiKey: provider.labelForGetApiKey,
      icon: provider.icon,
    }));
  }

  const defaultProvider = llmManager.getDefaultProvider();

  const defaultProviderInfo = {
    name: defaultProvider.name,
    staticModels: defaultProvider.staticModels,
    getApiKeyLink: defaultProvider.getApiKeyLink,
    labelForGetApiKey: defaultProvider.labelForGetApiKey,
    icon: defaultProvider.icon,
  };

  return { providers: cachedProviders, defaultProvider: defaultProviderInfo };
}

export const loader = withSecurity(
  async ({
    request,
    params,
    context,
  }: {
    request: Request;
    params: { provider?: string };
    context: {
      cloudflare?: {
        env: any;
      };
    };
  }): Promise<Response> => {
  const llmManager = LLMManager.getInstance(context.cloudflare?.env);
  const apiKeys = getApiKeysFromRequest(request);
  const providerSettings = getProviderSettingsFromRequest(request);
  const { providers, defaultProvider } = getProviderInfo(llmManager);

  if (!params.provider) {
    return json<ModelsResponse>({
      modelList: [],
      providers,
      defaultProvider,
    });
  }

  const provider = llmManager.getProvider(params.provider);

  if (!provider) {
    return json({ error: `Unknown provider: ${params.provider}` }, { status: 404 });
  }

  const modelList = await llmManager.getModelListFromProvider(provider, {
    apiKeys,
    providerSettings,
    serverEnv: context.cloudflare?.env,
  });

  return json<ModelsResponse>({
    modelList,
    providers,
    defaultProvider,
  });
  },
  { allowedMethods: ['GET'], requireAuth: true },
);
