# Bolt.diy Local LLM Features

Enhanced local LLM support for Bolt.diy, inspired by the Open WebUI Docker
Extension strategy.

## Overview

This implementation adds comprehensive local LLM support to Bolt.diy, including:

- ✅ **Auto-discovery** of local LLM providers
- ✅ **Health monitoring** with real-time status
- ✅ **Bundled Ollama** support via Docker
- ✅ **Multi-provider** support (Ollama, LMStudio, Jan, GPT4All)
- ✅ **Zero-config** setup for common providers
- ✅ **Model management** from the UI
- ✅ **Docker-aware** networking

## What's New

### 1. Auto-Discovery Service

Bolt.diy now automatically discovers local LLM providers running on your system:

```typescript
// Automatically scans:
// - Ollama: http://127.0.0.1:11434
// - LMStudio: http://127.0.0.1:1234
// - Jan.ai: http://127.0.0.1:1337
// - GPT4All: http://127.0.0.1:4891
```

**Usage**:

- Go to Settings → Providers
- Click "Discover Local Providers"
- Enable discovered providers

### 2. Health Monitoring

Real-time health checks for all configured providers:

- ✅ Status indicators (Healthy/Unhealthy)
- ✅ Response time monitoring
- ✅ Model count display
- ✅ Automatic re-check every 30 seconds

### 3. Bundled Ollama (Docker)

Run Ollama automatically with Bolt.diy:

```bash
# Start with bundled Ollama
pnpm run docker:run:local-llm

# Or manually
docker-compose --profile local-llm up -d
```

**Features**:

- Persistent model storage
- GPU support (NVIDIA)
- Auto-healing with health checks
- Resource limits

### 4. Enhanced API Endpoints

New API routes for local provider management:

```bash
# Discover providers
POST /api/local-providers/discover

# Check provider health
GET  /api/local-providers/health?baseUrl=http://127.0.0.1:11434
POST /api/local-providers/health
```

## Installation

### Quick Start

1. **Install dependencies** (if not already done):

   ```bash
   pnpm install
   ```

2. **Start your local LLM provider**:

   ```bash
   # Ollama
   ollama serve
   
   # Or LMStudio (start server from UI)
   # Or Jan (start server from settings)
   ```

3. **Start Bolt.diy**:

   ```bash
   pnpm run dev
   ```

4. **Discover providers**:
   - Open [http://localhost:5173](http://localhost:5173)
   - Go to Settings → Providers
   - Click "Discover Local Providers"
   - Enable discovered providers

### Docker Setup with Ollama

1. **Start with bundled Ollama**:

   ```bash
   pnpm run docker:run:local-llm
   ```

2. **Pull a model**:

   ```bash
   pnpm run docker:ollama:pull gemma:7b
   ```

3. **Access Bolt**: [http://localhost:5173](http://localhost:5173)

## Configuration

### Environment Variables

Add to `.env.local`:

```bash
# Local LLM Configuration
OLLAMA_API_BASE_URL=http://127.0.0.1:11434
DEFAULT_LLM_PROVIDER=Ollama
DEFAULT_LLM_MODEL=gemma:7b

# Advanced Settings
DEFAULT_NUM_CTX=32768        # Context window size
RUNNING_IN_DOCKER=true       # Auto-detected in container
```

### Docker Compose Profiles

```bash
# Production without local LLM
docker-compose --profile production up -d

# With bundled Ollama
docker-compose --profile local-llm up -d

# All services
docker-compose --profile all up -d
```

## Usage

### Auto-Discovery

```typescript
import { discoverLocalProviders } from '~/lib/services/local-provider-discovery';

const providers = await discoverLocalProviders();
providers.forEach(p => {
  console.log(`${p.name} at ${p.baseUrl} - ${p.models.length} models`);
});
```

### Health Monitoring

```typescript
import { localProvidersStore, startProviderHealthCheck } from '~/lib/stores/local-providers';

// Start automatic health checking
const cleanup = startProviderHealthCheck(30000); // Check every 30s

// Get current status
const status = localProvidersStore.get();
```

### Manual Provider Configuration

1. Open Settings → Providers
2. Select provider type (Ollama, LMStudio, etc.)
3. Enter base URL
4. Click "Test Connection"
5. Save and Enable

## Supported Providers

| Provider     | Auto-Discover | Health Check | Model Fetch | Docker Support |
|--------------|---------------|--------------|-------------|----------------|
| Ollama       | ✅            | ✅           | ✅          | ✅ Bundled     |
| LMStudio     | ✅            | ✅           | ✅          | ⚠️ Host only   |
| Jan.ai       | ✅            | ✅           | ✅          | ⚠️ Host only   |
| GPT4All      | ✅            | ✅           | ✅          | ⚠️ Host only   |
| OpenAI-Like  | ❌            | ✅           | ✅          | ✅             |

## Architecture

### Files Added

```text
app/
├── lib/
│   ├── services/
│   │   └── local-provider-discovery.ts    # Auto-discovery logic
│   └── stores/
│       └── local-providers.ts             # Health monitoring store
└── routes/
    ├── api.local-providers.discover.ts    # Discovery API endpoint
    └── api.local-providers.health.ts      # Health check API endpoint

docker-compose.local-llm.yaml              # Docker config with Ollama
docs/
├── LOCAL_LLM_STRATEGY_ANALYSIS.md         # Strategy document
└── LOCAL_LLM_SETUP.md                     # Setup guide
```

### Data Flow

```text
┌─────────────────┐
│   Bolt UI       │
│  Settings Page  │
└────────┬────────┘
         │
         │ User clicks "Discover"
         │
         ▼
┌─────────────────┐
│  API Endpoint   │
│ /api/local-     │
│ providers/      │
│ discover        │
└────────┬────────┘
         │
         │ Scans known endpoints
         │
         ▼
┌─────────────────┐
│   Discovery     │
│   Service       │
│ - Ollama:11434  │
│ - LMStudio:1234 │
│ - Jan:1337      │
│ - GPT4All:4891  │
└────────┬────────┘
         │
         │ Returns discovered providers
         │
         ▼
┌─────────────────┐
│   Provider      │
│   Store         │
│ (nanostores)    │
└────────┬────────┘
         │
         │ Real-time updates
         │
         ▼
┌─────────────────┐
│   Bolt UI       │
│  (Status UI)    │
└─────────────────┘
```

## API Reference

### POST /api/local-providers/discover

Discover local LLM providers.

**Request**:

```bash
curl -X POST http://localhost:5173/api/local-providers/discover
```

**Response**:

```json
{
  "providers": [
    {
      "name": "Ollama",
      "baseUrl": "http://127.0.0.1:11434",
      "status": "available",
      "models": [
        {"name": "gemma:7b", "label": "gemma:7b (7B)", "provider": "Ollama"}
      ],
      "responseTime": 45
    }
  ],
  "recommended": {
    "name": "Ollama",
    "baseUrl": "http://127.0.0.1:11434",
    "modelCount": 3
  }
}
```

### GET /api/local-providers/health

Check provider health.

**Request**:

```bash
curl "http://localhost:5173/api/local-providers/health?baseUrl=http://127.0.0.1:11434"
```

**Response**:

```json
{
  "baseUrl": "http://127.0.0.1:11434",
  "available": true,
  "responseTime": 42,
  "error": null
}
```

### POST /api/local-providers/health

Check provider health with JSON body.

**Request**:

```bash
curl -X POST http://localhost:5173/api/local-providers/health \
  -H "Content-Type: application/json" \
  -d '{"baseUrl": "http://127.0.0.1:11434"}'
```

## Troubleshooting

### Provider Not Discovered

1. Verify provider is running:

   ```bash
   curl http://127.0.0.1:11434/api/tags
   ```

2. Check firewall settings

3. Try manual configuration

### Docker Can't Access Host

Use `host.docker.internal`:

```bash
OLLAMA_API_BASE_URL=http://host.docker.internal:11434
```

### Ollama Slow

1. Use smaller models: `ollama pull llama3.2:1b`
2. Reduce context: `DEFAULT_NUM_CTX=8192`
3. Enable GPU acceleration

## Performance Tips

### Model Recommendations

| Use Case      | Model               | Size | Speed      |
|---------------|---------------------|------|------------|
| General       | `gemma:7b`          | 7B   | Fast       |
| Coding        | `codellama:7b`      | 7B   | Fast       |
| Accuracy      | `llama3.2:3b`       | 3B   | Very Fast  |
| Large Context | `llama3.1:8b`       | 8B   | Medium     |

### Resource Optimization

```bash
# Limit parallel requests
OLLAMA_NUM_PARALLEL=2

# Keep models warm
OLLAMA_KEEP_ALIVE=24h

# Reduce memory usage
DEFAULT_NUM_CTX=16384
```

## Comparison with Open WebUI

| Feature            | Open WebUI       | Bolt.diy (New)   |
|--------------------|------------------|------------------|
| Auto-discovery     | Yes              | Yes              |
| Health monitoring  | Yes              | Yes              |
| Bundled Ollama     | Yes              | Yes              |
| Multi-provider     | Partial Basic    | Yes Advanced     |
| Provider settings  | Partial Limited  | Yes Per-provider |
| Dynamic caching    | Partial Basic    | Yes Smart caching|
| Cloudflare Workers | No               | Yes              |
| Electron app       | No               | Yes              |

## Roadmap

### Phase 1 (Completed)

- ✅ Auto-discovery service
- ✅ Health monitoring
- ✅ API endpoints

### Phase 2 (In Progress)

- [ ] UI components for provider status
- [ ] Model management UI
- [ ] Setup wizard

### Phase 3 (Planned)

- [ ] Docker extension packaging
- [ ] Load balancing
- [ ] Model pull/install from UI

## Contributing

Contributions welcome! Areas for improvement:

1. Additional provider support (vLLM, TGI, etc.)
2. UI components for health status
3. Model management interface
4. Performance optimizations

## License

MIT License - same as Bolt.diy

## Resources

- [Local LLM Strategy Analysis](./LOCAL_LLM_STRATEGY_ANALYSIS.md)
- [Setup Guide](./LOCAL_LLM_SETUP.md)
- [Bolt.diy Documentation](https://github.com/stackblitz-labs/bolt.diy)
- [Open WebUI Docker Extension](https://github.com/rw4lll/open-webui-docker-extension)
