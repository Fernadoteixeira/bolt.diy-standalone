#!/bin/bash

set -euo pipefail

APP_DIR="/app"
LOCKFILE="$APP_DIR/pnpm-lock.yaml"
NODE_MODULES_DIR="$APP_DIR/node_modules"
STAMP_FILE="$NODE_MODULES_DIR/.bolt-lockfile.sha256"

mkdir -p "$NODE_MODULES_DIR" /pnpm/store "$APP_DIR/.cache" /root/.config

if [ ! -f "$APP_DIR/package.json" ] || [ ! -f "$LOCKFILE" ]; then
  echo "Missing package.json or pnpm-lock.yaml under /app. Mount the repository into the container before starting development."
  exit 1
fi

current_hash="$(sha256sum "$LOCKFILE" | awk '{print $1}')"
installed_hash=""

if [ -f "$STAMP_FILE" ]; then
  installed_hash="$(cat "$STAMP_FILE")"
fi

if [ ! -f "$NODE_MODULES_DIR/.modules.yaml" ] || [ "$current_hash" != "$installed_hash" ]; then
  echo "Installing dependencies into the persistent Docker volumes..."
  pnpm install --frozen-lockfile --prefer-offline
  echo "$current_hash" > "$STAMP_FILE"
else
  echo "Reusing persistent node_modules and pnpm store volumes."
fi

exec pnpm run dev --host 0.0.0.0
