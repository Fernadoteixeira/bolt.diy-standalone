#!/bin/bash
# Docker setup script with persistent caches
# Usage: ./scripts/docker-setup.sh [production|development|prebuilt]

set -e

PROFILE="${1:-development}"
DOCKER_DATA_DIR=".docker"
ENV_FILE=".env.docker"

echo "🐳 Docker Setup - Profile: $PROFILE"
echo "📁 Preparing persistent cache directories..."

# Create data directories if they don't exist
mkdir -p "$DOCKER_DATA_DIR/data"
mkdir -p "$DOCKER_DATA_DIR/cache"

echo "✅ Directories created:"
echo "   - $DOCKER_DATA_DIR/data (Wrangler config, application data)"
echo "   - $DOCKER_DATA_DIR/cache (Build cache)"
echo "   - Docker named volumes: bolt-node-modules, bolt-pnpm-store"

echo ""
echo "🔨 Building and starting services..."

compose_args=()

if [ -f "$ENV_FILE" ]; then
  compose_args+=(--env-file "$ENV_FILE")
fi

case "$PROFILE" in
  production)
    docker compose "${compose_args[@]}" --profile production up -d --build
    echo "✅ Production service started on http://localhost:5173"
    ;;
  development)
    docker compose "${compose_args[@]}" --profile development up -d --build
    echo "✅ Development service started on http://localhost:5173"
    ;;
  prebuilt)
    docker compose "${compose_args[@]}" --profile prebuilt up -d
    echo "✅ Prebuilt service started on http://localhost:5173"
    ;;
  *)
    echo "❌ Unknown profile: $PROFILE"
    echo "Usage: ./scripts/docker-setup.sh [production|development|prebuilt]"
    exit 1
    ;;
esac

echo ""
echo "📊 Service Status:"
docker compose ps

echo ""
echo "💾 Persistent Storage:"
echo "   Data: $(pwd)/$DOCKER_DATA_DIR/data"
echo "   Cache: $(pwd)/$DOCKER_DATA_DIR/cache"
echo "   Named volumes: bolt-node-modules, bolt-pnpm-store"

echo ""
echo "📝 Available Commands:"
echo "   - View logs: docker compose logs -f"
echo "   - Stop services: docker compose down"
echo "   - Remove volumes: docker compose down -v"
echo "   - Rebuild: docker compose build --no-cache"
