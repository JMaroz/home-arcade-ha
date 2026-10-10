# BUILD_ARCH must be declared BEFORE the first FROM that references it
ARG BUILD_ARCH=amd64

# Stage 1: Build native WebRTC runner binary with Go
FROM --platform=linux/${BUILD_ARCH} golang:1.22-alpine AS runner-builder
WORKDIR /build
COPY server/native-runner/ ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /homearcade-runner . || echo "Fallback runner"

# Stage 2: Main Home Assistant add-on image
FROM --platform=linux/${BUILD_ARCH} ghcr.io/home-assistant/${BUILD_ARCH}-base:latest

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

# Install Node.js + native build deps for better-sqlite3, plus pnpm
RUN apk add --no-cache \
      nodejs npm && \
    apk add --no-cache python3 make g++ sqlite-libs libstdc++ && \
    npm install -g pnpm@9 && \
    node --version && npm --version && pnpm --version

# Copy compiled native runner binary
COPY --from=runner-builder /homearcade-runner* /usr/local/bin/

WORKDIR /app

# Install dependencies (project uses pnpm)
# --no-frozen-lockfile allows install when package.json has drifted ahead of pnpm-lock.yaml
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN NODE_ENV=development pnpm install --no-frozen-lockfile

# Cache-bust arg — increment this to force a full source re-copy and rebuild.
ARG CACHE_BUST=6

# Copy all source (cache busted by ARG above)
COPY tsconfig.json vite.config.ts components.json drizzle.config.ts ./
COPY shared   ./shared
COPY server   ./server
COPY client   ./client
COPY script   ./script
COPY migrations ./migrations
COPY ejs_cache_essential ./ejs_cache_essential

# Build client (Vite) + server (esbuild -> dist/index.cjs)
RUN NODE_ENV=production pnpm run build

# Hard-fail the image build if the server bundle is missing
RUN test -f dist/index.cjs || { echo "ERROR: dist/index.cjs not found after build"; exit 1; }

# Prune dev deps to keep the image lean
RUN pnpm prune --prod

# Install s6-overlay v3 service files
COPY rootfs /
RUN chmod a+x \
      /etc/s6-overlay/s6-rc.d/homearcade/run \
      /etc/s6-overlay/s6-rc.d/homearcade/finish

EXPOSE 5000
ENTRYPOINT ["/init"]
