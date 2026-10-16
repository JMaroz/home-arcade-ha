# BUILD_ARCH and BUILD_FROM must be declared BEFORE the first FROM that references them
ARG BUILD_ARCH=amd64
ARG BUILD_FROM=ghcr.io/home-assistant/base-debian:bookworm

# ==============================================================================
# Stage 1: Build native WebRTC runner binary with Go + Cgo + GStreamer
# ==============================================================================
FROM golang:1.24-bookworm AS runner-builder
WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      pkg-config \
      libvpx-dev

COPY server/native-runner/go.mod server/native-runner/go.sum ./
RUN go mod download
COPY server/native-runner/ ./
RUN CGO_ENABLED=1 go build -ldflags="-s -w" -o /homearcade-runner .
RUN test -f /homearcade-runner || { echo "ERROR: /homearcade-runner not found after build"; exit 1; }

# ==============================================================================
# Stage 2: Node.js builder (compiles better-sqlite3 native addon, client & server)
# ==============================================================================
FROM ${BUILD_FROM} AS node-builder

# Install Node.js, native build deps for better-sqlite3, and pnpm
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
      python3 \
      make \
      g++ \
      libsqlite3-dev \
      && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
      && apt-get install -y --no-install-recommends nodejs \
      && npm install -g pnpm@9 \
      && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Configure fetch retries & timeouts for node-gyp and pnpm to survive transient network timeouts
ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=120000

# Install dependencies (project uses pnpm)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN NODE_ENV=development pnpm install --no-frozen-lockfile

# Cache-bust arg — increment this to force a full source re-copy and rebuild.
ARG CACHE_BUST=8

# Copy source needed for build
COPY tsconfig.json vite.config.ts components.json drizzle.config.ts ./
COPY shared   ./shared
COPY server   ./server
COPY client   ./client
COPY script   ./script
COPY migrations ./migrations

# Build client (Vite -> dist/public) + server (esbuild -> dist/index.cjs)
RUN NODE_ENV=production pnpm run build

# Hard-fail the image build if the server bundle is missing
RUN test -f dist/index.cjs || { echo "ERROR: dist/index.cjs not found after build"; exit 1; }

# Prune dev dependencies to keep node_modules minimal for runtime
RUN pnpm prune --prod

# ==============================================================================
# Stage 3: Ultra-lean production runtime image (Debian Base with GStreamer & glibc)
# ==============================================================================
FROM ${BUILD_FROM} AS runtime

# Build arguments provided by the HA builder / GitHub Actions workflow
ARG BUILD_ARCH=amd64
ARG BUILD_VERSION="dev"

# Required labels for Home Assistant Supervisor to recognise the image
LABEL \
    io.hass.version="${BUILD_VERSION}" \
    io.hass.type="addon" \
    io.hass.arch="${BUILD_ARCH}" \
    org.opencontainers.image.title="HomeArcade" \
    org.opencontainers.image.description="The premium retro gaming frontend for Home Assistant." \
    org.opencontainers.image.source="https://github.com/JMaroz/HomeArcade-HA" \
    org.opencontainers.image.licenses="MIT"

ENV LANG=C.UTF-8 \
    PORT=5000 \
    NODE_ENV=production

# Install runtime dependencies: Node.js 20 + glibc SQLite + libvpx for WebRTC streaming + archive tools (unzip, 7zip)
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
      libsqlite3-0 \
      libstdc++6 \
      libvpx7 \
      unzip \
      7zip \
      && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
      && apt-get install -y --no-install-recommends nodejs \
      && apt-get purge -y curl \
      && apt-get autoremove -y \
      && rm -rf /var/lib/apt/lists/*

# Copy compiled native runner binary from runner-builder
COPY --from=runner-builder /homearcade-runner /usr/local/bin/homearcade-runner
RUN chmod a+x /usr/local/bin/homearcade-runner

WORKDIR /app

# Copy production artifacts from node-builder
COPY --from=node-builder /app/dist ./dist
COPY --from=node-builder /app/migrations ./migrations
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/package.json ./package.json

# Install s6-overlay v3 service files
COPY rootfs /
RUN chmod a+x \
      /etc/s6-overlay/s6-rc.d/homearcade/run \
      /etc/s6-overlay/s6-rc.d/homearcade/finish

EXPOSE 5000
ENTRYPOINT ["/init"]
