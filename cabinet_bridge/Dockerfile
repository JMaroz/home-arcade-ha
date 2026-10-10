# BUILD_ARCH must be declared BEFORE the first FROM that references it
ARG BUILD_ARCH=amd64

# ==============================================================================
# Stage 1: Build native WebRTC runner binary with Go + UPX compression
# ==============================================================================
FROM --platform=linux/${BUILD_ARCH} golang:1.22-alpine AS runner-builder
WORKDIR /build
RUN apk add --no-cache upx || true
COPY server/native-runner/ ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /homearcade-runner .
RUN test -f /homearcade-runner || { echo "ERROR: /homearcade-runner not found after build"; exit 1; }
RUN upx --best --lzma /homearcade-runner || true

# ==============================================================================
# Stage 2: Node.js builder (compiles better-sqlite3 native addon, client & server)
# ==============================================================================
FROM --platform=linux/${BUILD_ARCH} ghcr.io/home-assistant/${BUILD_ARCH}-base:latest AS node-builder

# Install Node.js, native build deps for better-sqlite3, and pnpm
RUN apk add --no-cache \
      nodejs npm python3 make g++ sqlite-libs libstdc++ && \
    npm install -g pnpm@9

WORKDIR /app

# Install dependencies (project uses pnpm)
# --no-frozen-lockfile allows install when package.json has drifted ahead of pnpm-lock.yaml
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN NODE_ENV=development pnpm install --no-frozen-lockfile

# Cache-bust arg — increment this to force a full source re-copy and rebuild.
ARG CACHE_BUST=7

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
# Stage 3: Ultra-lean production runtime image (no gcc, no g++, no python, no npm)
# ==============================================================================
FROM --platform=linux/${BUILD_ARCH} ghcr.io/home-assistant/${BUILD_ARCH}-base:latest AS runtime

# Build arguments provided by the HA builder / GitHub Actions workflow
ARG BUILD_ARCH=amd64
ARG BUILD_VERSION="dev"

# Required labels for Home Assistant Supervisor to recognise the image
LABEL \
    io.hass.version="${BUILD_VERSION}" \
    io.hass.type="addon" \
    io.hass.arch="${BUILD_ARCH}"

ENV LANG=C.UTF-8 \
    PORT=5000 \
    NODE_ENV=production

# Install ONLY runtime dependencies: nodejs runtime + sqlite-libs + libstdc++
RUN apk add --no-cache \
      nodejs \
      sqlite-libs \
      libstdc++

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
