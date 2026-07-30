# Local LLM Setup Guide for Bolt.diy

This guide explains how to set up and use local LLM providers with Bolt.diy, including auto-discovery, bundled Ollama, and manual provider configuration.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Auto-Discovery](#auto-discovery)
3. [Bundled Ollama (Docker)](#bundled-ollama-docker)
4. [Manual Provider Setup](#manual-provider-setup)
5. [Provider-Specific Guides](#provider-specific-guides)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Option 1: Auto-Discovery (Recommended)

Bolt.diy can automatically discover local LLM providers running on your system.

1. **Start your local LLM provider** (Ollama, LMStudio, etc.)
2. **Open Bolt.diy Settings** → **Providers**
3. **Click "Discover Local Providers"**
4. **Enable discovered providers**

Supported auto-discovered providers:

- Ollama (port 11434)
- LMStudio (port 1234)
- Jan.ai (port 1337)
- GPT4All (port 4891)

### Option 2: Bundled Ollama (Docker)

Run Ollama automatically with Bolt.diy in Docker:

```bash
# Start Bolt with bundled Ollama
docker-compose --profile local-llm up -d

# Pull a model (optional - can also be done from Bolt UI)
docker exec -it bolt-ollama ollama pull gemma:7b

# Access Bolt at http://localhost:5173
```

### Option 3: Manual Configuration

1. Open **Settings** → **Providers**
2. Select your provider (Ollama, LMStudio, etc.)
3. Enter the base URL (e.g., `http://127.0.0.1:11434`)
4. Click **Test Connection**
5. **Save** and **Enable**

---

## Auto-Discovery

### How It Works

Bolt.diy scans common localhost ports for LLM providers:

| Provider | Default URLs | Health Endpoint |
|----------|--------------|-----------------|
| Ollama   | `http://127.0.0.1:11434`, `http://localhost:11434` | `/api/tags` |
| LMStudio | `http://127.0.0.1:1234`, `http://localhost:1234` | `/v1/models` |
| Jan.ai   | `http://127.0.0.1:1337`, `http://localhost:1337` | `/v1/models` |
| GPT4All  | `http://127.0.0.1:4891`, `http://localhost:4891` | `/api/v1/models` |

### API Endpoint

```bash
# Discover providers programmatically
curl -X POST http://localhost:5173/api/local-providers/discover

# Response example
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

### Health Check API

```bash
# Check specific provider health
curl "http://localhost:5173/api/local-providers/health?baseUrl=http://127.0.0.1:11434"
```

---

## Bundled Ollama (Docker)

### Prerequisites

- Docker Desktop installed
- Docker Compose v2.0+
- 8GB+ RAM recommended
- NVIDIA GPU (optional, for faster inference)

### Setup Steps

#### 1. Start with Local LLM Profile

```bash
# Navigate to Bolt.diy directory
cd bolt.diy

# Start with bundled Ollama
docker-compose --profile local-llm up -d

# Check status
docker-compose ps
```

#### 2. Verify Ollama is Running

```bash
# Check Ollama container
docker ps | grep bolt-ollama

# Test Ollama endpoint
curl http://localhost:11434/api/tags
```

#### 3. Pull Models

```bash
# Pull a model into the container
docker exec -it bolt-ollama ollama pull gemma:7b

# List installed models
docker exec -it bolt-ollama ollama list

# Pull additional models
docker exec -it bolt-ollama ollama pull llama3.2:3b
docker exec -it bolt-ollama ollama pull qwen2.5:7b
docker exec -it bolt-ollama ollama pull codellama:7b
```

#### 4. Configure Bolt.diy

1. Open [http://localhost:5173](http://localhost:5173)
2. Go to **Settings** → **Providers**
3. **Ollama** should show as "Healthy" with model count
4. Select a model from the dropdown
5. Start chatting!

### Configuration Options

Edit `.env.local` to customize Ollama:

```bash
# Ollama Configuration
OLLAMA_API_BASE_URL=http://127.0.0.1:11434
DEFAULT_LLM_PROVIDER=Ollama
DEFAULT_LLM_MODEL=gemma:7b

# Advanced Ollama Settings
OLLAMA_NUM_PARALLEL=2          # Parallel requests
OLLAMA_MAX_LOADED_MODELS=3     # Max loaded models
OLLAMA_KEEP_ALIVE=24h          # Keep models in memory
OLLAMA_DEBUG=false             # Debug logging

# Context Window
DEFAULT_NUM_CTX=32768          # Context size
```

### GPU Support

For NVIDIA GPU acceleration, ensure you have:

1. **NVIDIA Container Toolkit** installed
2. **NVIDIA drivers** up to date

```bash
# Verify GPU is accessible
docker run --rm --gpus all nvidia/cuda:11.0.3-base-ubuntu20.04 nvidia-smi
```

### Managing Ollama

```bash
# View Ollama logs
docker logs bolt-ollama

# Restart Ollama
docker-compose restart ollama-local

# Stop Ollama only
docker-compose stop ollama-local

# Remove Ollama data (WARNING: deletes all models)
docker-compose down -v ollama-models
```

---

## Manual Provider Setup

### Ollama (Self-Hosted)

1. **Install Ollama**: [https://ollama.com/download](https://ollama.com/download)
2. **Start Ollama**: `ollama serve`
3. **Pull Models**:

   ```bash
   ollama pull gemma:7b
   ollama pull llama3.2:3b
   ollama pull qwen2.5:7b
   ```
4. **Configure in Bolt**:
   - Base URL: `http://127.0.0.1:11434`
   - No API key required

### LMStudio

1. **Install LMStudio**: [https://lmstudio.ai/](https://lmstudio.ai/)
2. **Download Models** from LMStudio UI
3. **Start Local Server**:
   - Click "Start Server" in LMStudio
   - Enable CORS in settings
4. **Configure in Bolt**:
   - Base URL: `http://127.0.0.1:1234`
   - No API key required

### Jan.ai

1. **Install Jan**: [https://jan.ai/](https://jan.ai/)
2. **Download Models** from Jan UI
3. **Start Server** in Jan settings
4. **Configure in Bolt**:
   - Base URL: `http://127.0.0.1:1337`
   - No API key required

### Custom OpenAI-Compatible Providers

1. **Configure in Bolt**:
   - Provider: **OpenAI-Like**
   - Base URL: Your custom endpoint
   - API Key: If required
   - Models: Comma-separated list

---

## Provider-Specific Guides

### Ollama

#### Recommended Models

```bash
# General Purpose
ollama pull gemma:7b           # Google's lightweight model
ollama pull llama3.2:3b        # Meta's efficient model
ollama pull qwen2.5:7b         # Alibaba's powerful model

# Coding
ollama pull codellama:7b       # Code-specialized model
ollama pull deepseek-coder:6.7b  # DeepSeek's coding model

# Large Context
ollama pull llama3.1:8b        # 128K context support
ollama pull mistral-large:123b # Mistral's largest model
```

#### Performance Tips

```bash
# Use smaller quantized models for faster inference
ollama pull llama3.2:1b        # Ultra-fast, low resource
ollama pull phi3:mini          # Microsoft's efficient model

# Set context window appropriately
export DEFAULT_NUM_CTX=16384   # Reduce for faster responses
```

### LMStudio Configuration

#### Model Recommendations

- **General**: `meta-llama/Llama-3.2-3B-Instruct`
- **Coding**: `TheBloke/CodeLlama-7B-Instruct-GGUF`
- **Fast**: `microsoft/Phi-3-mini-4k-instruct`

#### Server Configuration

```json
{
  "port": 1234,
  "cors": true,
  "context_length": 4096,
  "gpu_layers": 35
}
```

---

## Troubleshooting

### Provider Not Discovered

**Symptoms**: Auto-discovery doesn't find your provider

**Solutions**:

1. Verify provider is running:

   ```bash
   curl http://127.0.0.1:11434/api/tags  # Ollama
   curl http://127.0.0.1:1234/v1/models  # LMStudio
   ```
2. Check firewall settings
3. Try alternative URL (localhost vs 127.0.0.1)
4. Manually add provider in settings

### Docker Can't Access Host Provider

**Symptoms**: "Connection refused" errors in Docker

**Solutions**:

1. Use `host.docker.internal` instead of `localhost`:

   ```bash
   OLLAMA_API_BASE_URL=http://host.docker.internal:11434
   ```
2. On Linux, add to `/etc/hosts`:

   ```text
   172.17.0.1 host.docker.internal
   ```
3. On Windows/Mac, Docker Desktop handles this automatically

### Ollama Slow or Out of Memory

**Solutions**:

1. Use smaller models:

   ```bash
   ollama pull llama3.2:1b  # Instead of 7b
   ```
2. Reduce context window:

   ```bash
   export DEFAULT_NUM_CTX=8192
   ```
3. Limit parallel requests:

   ```bash
   OLLAMA_NUM_PARALLEL=1
   ```
4. Enable GPU acceleration

### Models Not Loading

**Symptoms**: Provider shows 0 models

**Solutions**:

1. Pull at least one model:

   ```bash
   ollama pull gemma:7b
   ```
2. Check model compatibility
3. Restart provider service
4. Verify disk space

### CORS Errors (LMStudio/Jan)

**Solutions**:

1. Enable CORS in provider settings
2. Use browser extension to bypass CORS (development only)

3. Run Bolt in development mode with CORS proxy

### Health Check Failing

**Symptoms**: Provider shows as "Unhealthy"

**Solutions**:

1. Check provider logs
2. Verify endpoint URLs
3. Test manually:

   ```bash
   curl -X POST http://localhost:5173/api/local-providers/health \
     -H "Content-Type: application/json" \
     -d '{"baseUrl": "http://127.0.0.1:11434"}'
   ```

---

## Advanced Configuration

### Multiple Local Providers

Configure multiple local providers for redundancy:

```bash
# .env.local
OLLAMA_API_BASE_URL=http://127.0.0.1:11434
LMSTUDIO_API_BASE_URL=http://127.0.0.1:1234

# Enable both in Bolt UI
# Bolt will use the healthy provider with most models
```

### Load Balancing

For high-availability setups:

```typescript
// Custom provider configuration
const providerConfig = {
  Ollama: {
    instances: [
      'http://127.0.0.1:11434',
      'http://192.168.1.100:11434',
    ],
    strategy: 'round-robin',
  },
};
```

### Custom Model Registry

Add custom models to provider:

```typescript
// In provider settings
{
  "customModels": [
    {
      "name": "my-custom-model",
      "label": "My Custom Model",
      "provider": "Ollama",
      "maxTokenAllowed": 8192
    }
  ]
}
```

---

## Performance Optimization

### Best Practices

1. **Use GPU acceleration** when available
2. **Choose appropriate model size** for your hardware
3. **Set reasonable context windows** (4K-32K typical)
4. **Keep models warm** with `OLLAMA_KEEP_ALIVE`
5. **Monitor resource usage** with `docker stats`

### Resource Recommendations

| Model Size | RAM Required | VRAM Recommended | Context Window |
|------------|--------------|------------------|----------------|
| 1B-3B      | 4-8 GB       | 2-4 GB           | 4K-8K          |
| 7B-8B      | 8-16 GB      | 6-8 GB           | 8K-16K         |
| 13B-14B    | 16-32 GB     | 12-16 GB         | 16K-32K        |
| 70B+       | 64+ GB       | 24+ GB           | 32K+           |

---

## Additional Resources

- [Ollama Documentation](https://ollama.com/docs)
- [LMStudio Guide](https://lmstudio.ai/docs)
- [Bolt.diy Repository](https://github.com/stackblitz-labs/bolt.diy)
- [Local LLM Strategy Analysis](./LOCAL_LLM_STRATEGY_ANALYSIS.md)

---

## Support

For issues or questions:

1. Check this guide's troubleshooting section
2. Review provider-specific documentation
3. Open an issue on the Bolt.diy repository
4. Join the community Discord/Telegram
