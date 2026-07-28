# Docker setup script with persistent caches for Windows
# Usage: .\scripts\docker-setup.ps1 -Profile production|development|prebuilt

param(
    [ValidateSet("production", "development", "prebuilt")]
    [string]$Profile = "development"
)

$ErrorActionPreference = "Stop"

$DOCKER_DATA_DIR = ".docker"
$EnvFile = ".env.docker"

Write-Host "🐳 Docker Setup - Profile: $Profile" -ForegroundColor Cyan
Write-Host "📁 Preparing persistent cache directories..." -ForegroundColor Yellow

# Create data directories if they don't exist
$dirs = @(
    "$DOCKER_DATA_DIR/data",
    "$DOCKER_DATA_DIR/cache"
)

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

Write-Host "✅ Directories created:" -ForegroundColor Green
Write-Host "   - $DOCKER_DATA_DIR/data (Wrangler config, application data)"
Write-Host "   - $DOCKER_DATA_DIR/cache (Build cache)"
Write-Host "   - Docker named volumes: bolt-node-modules, bolt-pnpm-store"

Write-Host ""
Write-Host "🔨 Building and starting services..." -ForegroundColor Yellow

$composeArgs = @()

if (Test-Path $EnvFile) {
    $composeArgs += @("--env-file", $EnvFile)
}

$composeArgs += @("--profile", $Profile, "up", "-d")

switch ($Profile) {
    "production" {
        & docker compose @($composeArgs + "--build")
        Write-Host "✅ Production service started on http://localhost:5173" -ForegroundColor Green
    }
    "development" {
        & docker compose @($composeArgs + "--build")
        Write-Host "✅ Development service started on http://localhost:5173" -ForegroundColor Green
    }
    "prebuilt" {
        & docker compose $composeArgs
        Write-Host "✅ Prebuilt service started on http://localhost:5173" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "📊 Service Status:" -ForegroundColor Cyan
& docker compose ps

$dataPath = (Get-Location).Path
Write-Host ""
Write-Host "💾 Persistent Storage:" -ForegroundColor Cyan
Write-Host "   Data: $dataPath\$DOCKER_DATA_DIR\data"
Write-Host "   Cache: $dataPath\$DOCKER_DATA_DIR\cache"
Write-Host "   Named volumes: bolt-node-modules, bolt-pnpm-store"

Write-Host ""
Write-Host "📝 Available Commands:" -ForegroundColor Cyan
Write-Host "   - View logs: docker compose logs -f"
Write-Host "   - Stop services: docker compose down"
Write-Host "   - Remove volumes: docker compose down -v"
Write-Host "   - Rebuild: docker compose build --no-cache"
