# syntax=docker/dockerfile:1.7

# ---- base stage ----
FROM node:22-bookworm-slim AS base
WORKDIR /app

ENV HUSKY=0 \
    CI=true \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN corepack enable && corepack prepare pnpm@9.14.4 --activate && \
    apt-get update && apt-get install -y --no-install-recommends bash curl git && \
    rm -rf /var/lib/apt/lists/* && \
    pnpm config set store-dir /pnpm/store

# ---- dependency metadata stage ----
FROM base AS deps

ARG VITE_PUBLIC_APP_URL
ENV VITE_PUBLIC_APP_URL=${VITE_PUBLIC_APP_URL}

COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --frozen-lockfile

# ---- build stage ----
FROM deps AS build
COPY . .

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile

RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm run build

# ---- production dependencies stage ----
FROM build AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm prune --prod --ignore-scripts

# ---- production stage ----
FROM base AS bolt-ai-production
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5173 \
    HOST=0.0.0.0

ARG VITE_LOG_LEVEL=debug
ARG DEFAULT_NUM_CTX

ENV WRANGLER_SEND_METRICS=false \
    VITE_LOG_LEVEL=${VITE_LOG_LEVEL} \
    DEFAULT_NUM_CTX=${DEFAULT_NUM_CTX} \
    RUNNING_IN_DOCKER=true

COPY --from=prod-deps /app/build /app/build
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps /app/package.json /app/package.json
COPY --from=prod-deps /app/bindings.sh /app/bindings.sh
COPY --from=prod-deps /app/worker-configuration.d.ts /app/worker-configuration.d.ts

RUN mkdir -p /root/.config/.wrangler && \
    echo '{"enabled":false}' > /root/.config/.wrangler/metrics.json && \
    chmod +x /app/bindings.sh

EXPOSE 5173

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD curl -fsS http://localhost:5173/ || exit 1

CMD ["pnpm", "run", "dockerstart"]

# ---- development stage ----
FROM base AS development

ARG VITE_LOG_LEVEL=debug
ARG DEFAULT_NUM_CTX

ENV NODE_ENV=development \
    VITE_HMR_PROTOCOL=ws \
    VITE_HMR_HOST=localhost \
    VITE_HMR_PORT=5173 \
    CHOKIDAR_USEPOLLING=true \
    WATCHPACK_POLLING=true \
    PORT=5173 \
    VITE_LOG_LEVEL=${VITE_LOG_LEVEL} \
    DEFAULT_NUM_CTX=${DEFAULT_NUM_CTX} \
    RUNNING_IN_DOCKER=true

COPY scripts/docker-dev-start.sh /usr/local/bin/docker-dev-start

RUN chmod +x /usr/local/bin/docker-dev-start && \
    mkdir -p /app /app/node_modules /pnpm/store /root/.config

CMD ["docker-dev-start"]
