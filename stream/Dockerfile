FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium xvfb ffmpeg fonts-liberation fonts-dejavu-core fonts-noto-color-emoji ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY worker.mjs view.html package.json ./
ENV NODE_ENV=production STREAM_ENABLED=0 CHROMIUM_BIN=chromium
EXPOSE 8080
CMD ["node", "worker.mjs"]
