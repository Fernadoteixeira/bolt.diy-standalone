import { map } from 'nanostores';
import { discoverLocalProviders, checkProviderAvailability } from '~/lib/services/local-provider-discovery';

export interface ProviderHealthStatus {
  name: string;
  baseUrl: string;
  status: 'healthy' | 'unhealthy' | 'unknown' | 'discovering';
  lastCheck?: Date;
  responseTime?: number;
  modelCount?: number;
  error?: string;
  autoDiscovered?: boolean;
}

/**
 * Store for local provider health status
 */
export const localProvidersStore = map<ProviderHealthStatus[]>([]);

/**
 * Check health of a specific provider
 */
export async function checkProviderHealth(name: string, baseUrl: string): Promise<ProviderHealthStatus> {
  try {
    const [availability, modelCount] = await Promise.all([
      checkProviderAvailability(baseUrl),
      getModelCount(baseUrl, name),
    ]);

    return {
      name,
      baseUrl,
      status: availability.available ? 'healthy' : 'unhealthy',
      lastCheck: new Date(),
      responseTime: availability.responseTime,
      modelCount,
      error: availability.error,
    };
  } catch (error) {
    return {
      name,
      baseUrl,
      status: 'unhealthy',
      lastCheck: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get model count from provider
 */
async function getModelCount(baseUrl: string, providerName: string): Promise<number> {
  try {
    let endpoint = '/v1/models';
    let parser = (data: any) => data.data?.length || 0;

    if (providerName === 'Ollama') {
      endpoint = '/api/tags';
      parser = (data: any) => data.models?.length || 0;
    }

    const response = await fetch(`${baseUrl}${endpoint}`, {
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return 0;
    }

    const data = await response.json();

    return parser(data);
  } catch {
    return 0;
  }
}

/**
 * Discover and update local providers
 */
export async function discoverAndUpdateProviders(): Promise<void> {
  // Set all to discovering state
  const current = localProvidersStore.get();
  localProvidersStore.set(current.map((p) => ({ ...p, status: 'discovering' as const })));

  try {
    const discovered = await discoverLocalProviders();

    const healthStatuses: ProviderHealthStatus[] = discovered.map((provider) => ({
      name: provider.name,
      baseUrl: provider.baseUrl,
      status: provider.status === 'available' ? 'healthy' : 'unhealthy',
      lastCheck: new Date(),
      responseTime: provider.responseTime,
      modelCount: provider.models.length,
      error: provider.error,
      autoDiscovered: true,
    }));

    localProvidersStore.set(healthStatuses);
  } catch (error) {
    console.error('Error discovering providers:', error);
  }
}

/**
 * Add a manual provider configuration
 */
export function addManualProvider(provider: ProviderHealthStatus): void {
  const current = localProvidersStore.get();
  localProvidersStore.set([...current, provider]);
}

/**
 * Remove a provider from the list
 */
export function removeProvider(baseUrl: string): void {
  const current = localProvidersStore.get();
  localProvidersStore.set(current.filter((p) => p.baseUrl !== baseUrl));
}

/**
 * Get healthy providers only
 */
export function getHealthyProviders(): ProviderHealthStatus[] {
  return localProvidersStore.get().filter((p) => p.status === 'healthy');
}

/**
 * Get provider by name
 */
export function getProviderByName(name: string): ProviderHealthStatus | undefined {
  return localProvidersStore.get().find((p) => p.name === name);
}

/**
 * Start automatic health checking (call this once on app init)
 */
export function startProviderHealthCheck(intervalMs: number = 30000): () => void {
  // Initial discovery
  discoverAndUpdateProviders();

  // Set up periodic checks
  const intervalId = setInterval(() => {
    const current = localProvidersStore.get();

    Promise.all(
      current.map(async (provider) => {
        const health = await checkProviderHealth(provider.name, provider.baseUrl);
        return health;
      }),
    ).then((updated) => {
      localProvidersStore.set(updated);
    });
  }, intervalMs);

  // Return cleanup function
  return () => clearInterval(intervalId);
}
