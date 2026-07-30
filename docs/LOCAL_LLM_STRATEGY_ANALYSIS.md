# Local LLM Strategy Analysis & Recommendations

## Executive Summary

Analysis of the Open WebUI Docker Extension's LLM strategy and recommendations
for enhancing Bolt.diy's local LLM capabilities.

---

## 1. Open WebUI Docker Extension Strategy

### Architecture Overview

The Open WebUI Docker Extension uses a **multi-layer provider abstraction**:

```text
┌─────────────────────────────────────┐
│     Docker Desktop Extension UI     │
│  - Image tag configuration          │
│  - Port management                  │
│  - Provisioner mode selection       │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Open WebUI Application         │
│  - Multi-provider support           │
│  - Provider configuration UI        │
│  - Model management                 │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│    Docker Model Runner (DMR)        │
│  - Local model execution            │
│  - OpenAI-compatible API            │
│  - Automatic model discovery        │
└─────────────────────────────────────┘
```

### Key Features

1. **Two Integration Modes**:
   - **OpenAI-compatible** (default): Registers DMR as an OpenAI provider
   - **Legacy Function**: Bundled `docker_model_runner.py` pipeline

2. **Configuration Management**:
   - Extension UI manages all settings
   - Persistent volumes for configuration
   - Dynamic provider registration

3. **Local LLM Support**:
   - Docker Model Runner deployed locally
   - Switch between DMR deployments
   - No command-line setup required

---

## 2. Bolt.diy Current Architecture

### Current State

```text
┌─────────────────────────────────────┐
│        Bolt.diy Frontend            │
│  - Provider settings UI             │
│  - Model selection                  │
│  - Cookie-based API key storage     │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      LLM Manager (manager.ts)       │
│  - Provider registry                │
│  - Dynamic model discovery          │
│  - Model caching                    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│    Provider Implementations         │
│  - BaseProvider (abstract)          │
│  - 20+ provider implementations     │
│  - Ollama, LMStudio, OpenAI-like    │
└─────────────────────────────────────┘
```

### Supported Local Providers

| Provider     | Base URL                               | Auto-Discovery          | Docker Support            |
|--------------|----------------------------------------|-------------------------|---------------------------|
| Ollama       | `http://127.0.0.1:11434`               | ✅ `/api/tags`          | ✅ `host.docker.internal` |
| LMStudio     | `http://127.0.0.1:1234`                | ❌ Manual config        | ⚠️ Requires CORS          |
| OpenAI-like  | Configurable                           | ⚠️ Env var only         | ✅ Supported              |

### Current Docker Configuration

```yaml
# docker-compose.yaml highlights
environment:
  - OLLAMA_API_BASE_URL=http://127.0.0.1:11434
  - OPENAI_API_BASE_URLS=http://host.docker.internal:12434/v1
  - OPENAI_API_KEYS=local-openai-compatible
  - RUNNING_IN_DOCKER=true
  - DEFAULT_LLM_PROVIDER=Ollama
  - DEFAULT_LLM_MODEL=gemma4:e4b
```

---

## 3. Gap Analysis

### Missing Features (vs Open WebUI)

| Feature                           | Open WebUI     | Bolt.diy        | Priority |
|-----------------------------------|----------------|-----------------|----------|
| Auto-detect local providers       | ✅             | ❌              | High     |
| Provider health checks            | ✅             | ❌              | High     |
| One-click local setup             | ✅             | ❌              | High     |
| Model pull/install UI             | ✅             | ❌              | Medium   |
| Context window auto-detection     | ⚠️ Partial     | ⚠️ Partial      | Medium   |
| Docker extension packaging        | ✅             | ❌              | Low      |
| Multiple local provider support   | ✅             | ⚠️ Limited      | Medium   |

### Bolt.diy Advantages

| Feature                       | Bolt.diy        | Open WebUI     |
|-------------------------------|-----------------|----------------|
| Multi-provider abstraction    | ✅ Better       | ⚠️ Basic       |
| Provider-specific settings    | ✅ Advanced     | ⚠️ Limited     |
| Dynamic model caching         | ✅              | ⚠️ Basic       |
| Cloudflare Workers support    | ✅              | ❌             |
| Electron desktop app          | ✅              | ❌             |

---

## 4. Recommendations

### 4.1 High Priority Improvements

#### A. Auto-Discovery Service for Local Providers

**Problem**: Users must manually configure local provider URLs

**Solution**: Implement auto-discovery that scans common local LLM endpoints

```typescript
// app/lib/services/local-provider-discovery.ts
interface LocalProviderEndpoint {
  name: string;
  urls: string[];
  healthCheck: string;
  modelEndpoint: string;
}

const KNOWN_ENDPOINTS: LocalProviderEndpoint[] = [
  {
    name: 'Ollama',
    urls: ['http://127.0.0.1:11434', 'http://localhost:11434'],
    healthCheck: '/api/tags',
    modelEndpoint: '/api/tags',
  },
  {
    name: 'LMStudio',
    urls: ['http://127.0.0.1:1234', 'http://localhost:1234'],
    healthCheck: '/v1/models',
    modelEndpoint: '/v1/models',
  },
  // Add more...
];

export async function discoverLocalProviders(): Promise<DiscoveredProvider[]> {
  const discovered: DiscoveredProvider[] = [];
  
  for (const endpoint of KNOWN_ENDPOINTS) {
    for (const baseUrl of endpoint.urls) {
      try {
        const response = await fetch(`${baseUrl}${endpoint.healthCheck}`, {
          signal: AbortSignal.timeout(3000),
        });
        
        if (response.ok) {
          discovered.push({
            name: endpoint.name,
            baseUrl,
            status: 'available',
            models: await fetchModels(baseUrl, endpoint.modelEndpoint),
          });
          break; // Stop after first successful URL
        }
      } catch (error) {
        // Continue to next URL
      }
    }
  }
  
  return discovered;
}
```

**Benefits**:

- Zero-config local LLM setup
- Better UX for non-technical users
- Automatic failover between URLs

#### B. Provider Health Monitoring

**Problem**: No way to know if local providers are running

**Solution**: Implement health check system with UI indicators

```typescript
// app/lib/stores/local-providers.ts
interface ProviderHealthStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck: Date;
  responseTime?: number;
  modelCount?: number;
  error?: string;
}

export const localProvidersStore = map<ProviderHealthStatus[]>([]);

export async function checkProviderHealth(
  provider: string,
  baseUrl: string
): Promise<ProviderHealthStatus> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    
    const models = await fetch(`${baseUrl}/api/tags`).then(r => r.json());
    
    return {
      name: provider,
      status: 'healthy',
      lastCheck: new Date(),
      responseTime: Date.now() - startTime,
      modelCount: models.models?.length || 0,
    };
  } catch (error) {
    return {
      name: provider,
      status: 'unhealthy',
      lastCheck: new Date(),
      error: error.message,
    };
  }
}

// Auto-check every 30 seconds
setInterval(() => {
  // Check all configured providers
}, 30000);
```

#### C. Docker-in-Docker Model Runner

**Problem**: Running local models requires separate setup

**Solution**: Bundle Ollama/LMStudio as optional Docker services

```yaml
# docker-compose.yaml addition
services:
  ollama-local:
    image: ollama/ollama:latest
    profiles:
      - local-llm
    volumes:
      - ollama-models:/root/.ollama
    ports:
      - "11434:11434"
    environment:
      - OLLAMA_KEEP_ALIVE=24h
    restart: unless-stopped

  app-prod:
    # ... existing config
    environment:
      - OLLAMA_API_BASE_URL=http://ollama-local:11434
    depends_on:
      - ollama-local
    profiles:
      - production
      - local-llm

volumes:
  ollama-models:
    driver: local
```

**UI Integration**: Add toggle in settings to enable/disable bundled Ollama

#### D. Model Management UI

**Problem**: No way to pull/install models from UI

**Solution**: Add model management interface

```typescript
// app/components/local-llm/ModelManager.tsx
export function ModelManager({ provider }: { provider: string }) {
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [installedModels, setInstalledModels] = useState<ModelInfo[]>([]);
  
  const pullModel = async (modelName: string) => {
    // Call API endpoint that proxies to ollama pull
    await fetch('/api/local-models/pull', {
      method: 'POST',
      body: JSON.stringify({ provider, model: modelName }),
    });
  };
  
  const deleteModel = async (modelName: string) => {
    await fetch('/api/local-models/delete', {
      method: 'DELETE',
      body: JSON.stringify({ provider, model: modelName }),
    });
  };
  
  return (
    <div>
      <h3>Available Models</h3>
      {availableModels.map(model => (
        <ModelCard 
          key={model.name}
          model={model}
          onPull={pullModel}
        />
      ))}
      
      <h3>Installed Models</h3>
      {installedModels.map(model => (
        <ModelCard 
          key={model.name}
          model={model}
          onDelete={deleteModel}
        />
      ))}
    </div>
  );
}
```

### 4.2 Medium Priority Improvements

#### E. Smart Context Window Detection

**Problem**: Context window must be manually configured

**Solution**: Auto-detect from provider API

```typescript
// Enhancement to existing provider implementations
async function getContextWindowFromProvider(
  baseUrl: string,
  model: string
): Promise<number | null> {
  try {
    // Ollama shows context length in show endpoint
    const response = await fetch(`${baseUrl}/api/show`, {
      method: 'POST',
      body: JSON.stringify({ name: model }),
    });
    
    const data = await response.json();
    return data.model_info?.context_length || null;
  } catch {
    return null;
  }
}

// Update BaseProvider
async function getDynamicModels(...) {
  const models = await fetchModels();
  
  // Enrich with context window info
  const enrichedModels = await Promise.all(
    models.map(async (model) => {
      const contextWindow = await getContextWindowFromProvider(baseUrl, model.name);
      return {
        ...model,
        maxTokenAllowed: contextWindow || model.maxTokenAllowed,
      };
    })
  );
  
  return enrichedModels;
}
```

#### F. Provider Configuration Wizard

**Problem**: Setup requires manual environment variable configuration

**Solution**: Interactive setup wizard

```typescript
// app/routes/setup.local-llm.tsx
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const provider = formData.get('provider');
  const autoDetect = formData.get('autoDetect') === 'true';
  
  if (autoDetect) {
    const discovered = await discoverLocalProviders();
    return json({ discovered });
  }
  
  // Save configuration
  const headers = new Headers();
  headers.append('Set-Cookie', serializeCookie('provider_config', {
    [provider]: {
      enabled: true,
      baseUrl: formData.get('baseUrl'),
    }
  }));
  
  return redirect('/chat', { headers });
}
```

#### G. Load Balancing Across Local Providers

**Problem**: Can't distribute load across multiple local instances

**Solution**: Implement provider load balancing

```typescript
// app/lib/modules/llm/load-balancer.ts
interface ProviderInstance {
  baseUrl: string;
  weight: number;
  currentLoad: number;
  maxConcurrent: number;
}

class LocalProviderBalancer {
  private providers: Map<string, ProviderInstance[]> = new Map();
  
  selectProvider(providerName: string): ProviderInstance {
    const instances = this.providers.get(providerName) || [];
    
    // Weighted round-robin
    const available = instances.filter(p => p.currentLoad < p.maxConcurrent);
    
    if (available.length === 0) {
      throw new Error('No available provider instances');
    }
    
    // Select instance with lowest load
    return available.reduce((min, p) => 
      p.currentLoad / p.maxConcurrent < min.currentLoad / min.maxConcurrent 
        ? p : min
    );
  }
  
  async executeRequest<T>(providerName: string, fn: (url: string) => Promise<T>): Promise<T> {
    const provider = this.selectProvider(providerName);
    
    provider.currentLoad++;
    
    try {
      return await fn(provider.baseUrl);
    } finally {
      provider.currentLoad--;
    }
  }
}
```

### 4.3 Low Priority (Future)

#### H. Docker Desktop Extension

Package Bolt as official Docker Desktop Extension (like Open WebUI)

#### I. Model Caching Strategy

Implement intelligent model caching with LRU eviction

#### J. Fallback Chain

Configure automatic fallback when primary provider fails

---

## 5. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

- [ ] Auto-discovery service
- [ ] Health monitoring
- [ ] Enhanced error handling

### Phase 2: UX Improvements (Week 3-4)

- [ ] Provider status UI indicators
- [ ] Setup wizard
- [ ] Model management UI

### Phase 3: Docker Integration (Week 5-6)

- [ ] Optional Ollama service in docker-compose
- [ ] Docker-aware configuration
- [ ] Volume management

### Phase 4: Advanced Features (Week 7-8)

- [ ] Load balancing
- [ ] Smart context detection
- [ ] Performance optimization

---

## 6. Configuration Examples

### Recommended .env.local for Local LLM

```bash
# Local LLM Auto-Configuration
OLLAMA_API_BASE_URL=http://127.0.0.1:11434
LMSTUDIO_API_BASE_URL=http://127.0.0.1:1234

# Default to local
DEFAULT_LLM_PROVIDER=Ollama
DEFAULT_LLM_MODEL=gemma4:e4b

# Docker-aware (auto-switches in container)
RUNNING_IN_DOCKER=true

# Context window for local models
DEFAULT_NUM_CTX=32768
```

### Docker Compose with Bundled Ollama

```yaml
services:
  ollama-local:
    image: ollama/ollama:latest
    profiles:
      - local-llm
    volumes:
      - ollama-models:/root/.ollama
    ports:
      - "11434:11434"
    environment:
      - OLLAMA_KEEP_ALIVE=24h
      - OLLAMA_NUM_PARALLEL=2
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  app-prod:
    # ... existing config
    environment:
      - OLLAMA_API_BASE_URL=http://ollama-local:11434
    extra_hosts:
      - 'host.docker.internal:host-gateway'
    profiles:
      - production
      - local-llm

volumes:
  ollama-models:
    driver: local
```

---

## 7. Conclusion

Bolt.diy already has a superior multi-provider architecture compared to Open
WebUI. By implementing the recommended improvements, particularly:

1. **Auto-discovery** for zero-config local setup
2. **Health monitoring** for better UX
3. **Docker integration** for bundled local LLM support
4. **Model management UI** for easier model handling

Bolt.diy can provide a best-in-class local LLM experience that surpasses Open
WebUI while maintaining its existing strengths in provider abstraction and
Cloudflare Workers support.

---

## References

- Open WebUI Docker Extension: [https://github.com/rw4lll/open-webui-docker-extension](https://github.com/rw4lll/open-webui-docker-extension)
- Ollama API Documentation: [https://github.com/ollama/ollama/blob/main/docs/api.md](https://github.com/ollama/ollama/blob/main/docs/api.md)
- LMStudio API: [https://lmstudio.ai/docs/local-server](https://lmstudio.ai/docs/local-server)
- Bolt.diy Repository: [https://github.com/stackblitz-labs/bolt.diy](https://github.com/stackblitz-labs/bolt.diy)
