# Docker Quick Start Guide

## Fast Setup (Windows)

```powershell
.\scripts\docker-setup.ps1 -Profile production
```

## Fast Setup (Linux/macOS)

```bash
./scripts/docker-setup.sh production
```

## Manual Setup

1. Create volume directories:

   ```bash
   mkdir -p .docker/{data,cache,npm-cache}
   ```

2. Load environment:

   ```bash
   source .env.docker
   ```

3. Start with persistent volumes:

   ```bash
   docker-compose -f docker-compose.yaml --profile production up -d
   ```

## Verify Setup

```bash
# Check running containers
docker ps

# Check volumes
docker volume ls | grep bolt

# View logs
docker-compose logs -f app-prod

# Healthcheck
curl -v http://localhost:5173
```

## Stop Services

```bash
docker-compose down
```

## Clean Up

```bash
# Remove volumes (preserves data in .docker/ directory)
docker volume prune

# Full cleanup (⚠️ removes all Docker volumes)
docker system prune -a --volumes
```

## Volume Paths

- **Data**: `.docker/data/` (Wrangler config, app data)
- **Cache**: `.docker/cache/` (Build artifacts, Vite cache)
- **NPM Cache**: `.docker/npm-cache/` (NPM packages)

## Environment Variables

Edit `.env.docker` to customize paths:

```bash
BOLT_DATA_PATH=./.docker/data
BOLT_CACHE_PATH=./.docker/cache
BOLT_NPM_CACHE_PATH=./.docker/npm-cache
```

For production (absolute paths):

```bash
BOLT_DATA_PATH=/data/bolt/data
BOLT_CACHE_PATH=/data/bolt/cache
BOLT_NPM_CACHE_PATH=/data/bolt/npm-cache
```

## Troubleshooting

### Permission Denied

```bash
# Check volume ownership
ls -la .docker/

# Fix permissions (Linux/macOS)
chmod -R 755 .docker/
```

### Volume Not Mounting

```bash
# Inspect volume configuration
docker volume inspect bolt-data

# Check docker-compose.yaml syntax
docker-compose config
```

### Container Won't Start

```bash
# View detailed logs
docker-compose logs app-prod

# Check disk space
docker system df
```

## Production Deployment

For production, use absolute paths and separate docker volumes:

```bash
# Use dedicated volume path
/data/bolt/data/
/data/bolt/cache/
/data/bolt/npm-cache/

# Or pure Docker volumes (no bind mount)
# Remove device: path from docker-compose.yaml
```

See [DOCKER_PERSISTENCE.md](./DOCKER_PERSISTENCE.md) for detailed configuration.
