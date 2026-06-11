# HyperFrames render service — Debian bookworm + FFmpeg + Chromium runtime libs
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=8080 \
    # Keep npx package cache + hyperframes' bundled Chromium under a stable HOME
    # so the build layer (root) and runtime (root) resolve the same paths.
    HOME=/root

# ── System deps: FFmpeg + the shared libraries headless Chromium needs ──
# (Chromium itself is fetched by `hyperframes browser install` below — we only
#  need its runtime .so dependencies + fonts here.)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      ca-certificates \
      curl \
      fonts-liberation \
      fonts-noto-color-emoji \
      libnss3 libnspr4 libdbus-1-3 \
      libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 \
      libcups2 libdrm2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 \
      libgbm1 libpango-1.0-0 libcairo2 libasound2 \
      libx11-6 libxcb1 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install JS deps first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Chromium cho lõi render Playwright (Phase 3, RENDER_ENGINE=playwright).
# Runtime .so đã cài ở khối apt trên; lệnh này chỉ tải browser bundle về /root/.cache.
RUN npx playwright install chromium

# Copy the project (compositions, assets, vendor, server)
COPY . .

# ── Smoke render at build time — auto-downloads the pinned Chromium on first run ──
# `hyperframes render` itself fetches the bundled Chromium if missing (there is NO
# `browser install` subcommand in 0.6.63). FAIL THE BUILD if the pipeline
# (Chromium download / fonts / gsap / Vietnamese) is broken.
RUN npx --yes hyperframes@0.6.63 render . \
         --composition compositions/animation.html \
         --quality draft \
         --variables '{"hook_keyword":"BUILD TEST ố ữ ệ"}' \
         --output /tmp/smoke.mp4 \
    && test -s /tmp/smoke.mp4 \
    && rm -f /tmp/smoke.mp4

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:8080/health || exit 1

CMD ["node", "server.mjs"]
