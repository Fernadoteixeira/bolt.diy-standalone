import type { ModelInfo } from '~/lib/modules/llm/types';

export type { ModelInfo };

/**
 * Known local LLM provider endpoints
 */
interface LocalProviderEndpoint {
  name: string;
  urls: string[];
  healthCheck: string;
  modelEndpoint: string;
  modelParser?: (data: any) => ModelInfo[];
}

export interface DiscoveredProvider {
  name: string;
  baseUrl: string;
  status: 'available' | 'unavailable';
  models: ModelInfo[];
  responseTime?: number;
  error?: string;
}

/**
 * Parse Ollama models response
 */
export function parseOllamaModels(data: any): ModelInfo[] {
  if (!data.models || !Array.isArray(data.models)) {
    return [];
  }

  return data.models.map((model: any) => ({
    name: model.name,
    label: `${model.name} (${model.details?.parameter_size || 'unknown'})`,
    provider: 'Ollama',
    maxTokenAllowed: 8000,
  }));
}

/**
 * Parse LMStudio models response (OpenAI-compatible)
 */
export function parseLMStudioModels(data: any): ModelInfo[] {
  if (!data.data || !Array.isArray(data.data)) {
    return [];
  }

  return data.data.map((model: any) => ({
    name: model.id,
    label: model.id,
    provider: 'LMStudio',
    maxTokenAllowed: model.context_length || 4096,
  }));
}

/**
 * Known endpoints for common local LLM providers
 */
const KNOWN_ENDPOINTS: LocalProviderEndpoint[] = [
  {
    name: 'Ollama',
    urls: ['http://127.0.0.1:11434', 'http://localhost:11434'],
    healthCheck: '/api/tags',
    modelEndpoint: '/api/tags',
    modelParser: parseOllamaModels,
  },
  {
    name: 'LMStudio',
    urls: ['http://127.0.0.1:1234', 'http://localhost:1234'],
    healthCheck: '/v1/models',
    modelEndpoint: '/v1/models',
    modelParser: parseLMStudioModels,
  },
  {
    name: 'Jan.ai',
    urls: ['http://127.0.0.1:1337', 'http://localhost:1337'],
    healthCheck: '/v1/models',
    modelEndpoint: '/v1/models',
    modelParser: parseLMStudioModels, // OpenAI-compatible
  },
  {
    name: 'GPT4All',
    urls: ['http://127.0.0.1:4891', 'http://localhost:4891'],
    healthCheck: '/api/v1/models',
    modelEndpoint: '/api/v1/models',
    modelParser: parseLMStudioModels,
  },
];

/**
 * Fetch models from a provider endpoint
 */
async function fetchModels(
  baseUrl: string,
  endpoint: string,
  parser: (data: any) => ModelInfo[],
): Promise<ModelInfo[]> {
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      signal: AbortSignal.timeout(5000),
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    return parser(data);
  } catch (error) {
    throw error;
  }
}

/**
 * Discover local LLM providers automatically
 *
 * Scans common localhost ports for known LLM providers
 * and returns a list of available providers with their models.
 *
 * @returns Promise resolving to array of discovered providers
 *
 * @example
 * const providers = await discoverLocalProviders();
 * providers.forEach(p => {
 *   console.log(`${p.name} at ${p.baseUrl} - ${p.models.length} models`);
 * });
 */
export async function discoverLocalProviders(): Promise<DiscoveredProvider[]> {
  const discovered: DiscoveredProvider[] = [];

  for (const endpoint of KNOWN_ENDPOINTS) {
    for (const baseUrl of endpoint.urls) {
      const startTime = Date.now();

      try {
        // Try health check / model endpoint
        const models = await fetchModels(baseUrl, endpoint.modelEndpoint, endpoint.modelParser || parseLMStudioModels);

        discovered.push({
          name: endpoint.name,
          baseUrl,
          status: 'available',
          models,
          responseTime: Date.now() - startTime,
        });

        // Stop after first successful URL for this provider
        break;
      } catch (error) {
        // Continue to next URL
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // If this is the last URL, record the failure
        if (endpoint.urls.indexOf(baseUrl) === endpoint.urls.length - 1) {
          discovered.push({
            name: endpoint.name,
            baseUrl,
            status: 'unavailable',
            models: [],
            error: errorMessage,
          });
        }
      }
    }
  }

  return discovered;
}

/**
 * Check if a specific provider is available
 *
 * @param baseUrl - Base URL of the provider
 * @param healthEndpoint - Health check endpoint (optional)
 * @returns Promise resolving to availability status
 */
export async function checkProviderAvailability(
  baseUrl: string,
  healthEndpoint: string = '/health',
): Promise<{ available: boolean; responseTime?: number; error?: string }> {
  const startTime = Date.now();

  let primaryError: string | undefined;

  try {
    const response = await fetch(`${baseUrl}${healthEndpoint}`, {
      signal: AbortSignal.timeout(5000),
      method: 'GET',
    });

    if (response.ok) {
      return {
        available: true,
        responseTime: Date.now() - startTime,
      };
    }

    primaryError = `Provider returned ${response.status}`;
  } catch (error) {
    primaryError = error instanceof Error ? error.message : 'Unknown error';
  }

  // Try alternative endpoints if the primary health check failed or errored
  const alternativeEndpoints = ['/v1/models', '/api/tags', '/api/health'];

  for (const endpoint of alternativeEndpoints) {
    try {
      const altResponse = await fetch(`${baseUrl}${endpoint}`, {
        signal: AbortSignal.timeout(3000),
      });

      if (altResponse.ok) {
        return {
          available: true,
          responseTime: Date.now() - startTime,
        };
      }
    } catch {
      continue;
    }
  }

  return {
    available: false,
    responseTime: Date.now() - startTime,
    error: primaryError,
  };
}

/**
 * Get recommended provider based on discovery results
 *
 * Returns the provider with the most models, or the fastest response time
 * if model counts are equal.
 */
export function getRecommendedProvider(providers: DiscoveredProvider[]): DiscoveredProvider | null {
  const available = providers.filter((p) => p.status === 'available');

  if (available.length === 0) {
    return null;
  }

  // Sort by model count (descending), then by response time (ascending)
  return available.sort((a, b) => {
    const modelDiff = b.models.length - a.models.length;

    if (modelDiff !== 0) {
      return modelDiff;
    }

    return (a.responseTime || 0) - (b.responseTime || 0);
  })[0];
}
