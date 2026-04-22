# Multi-stage build: küçük final image, reproducible dependencies.
# Node 20 LTS alpine — slim base, güvenlik patch'leri düzenli.

FROM node:20-alpine AS deps
WORKDIR /app

# Önce sadece package dosyalarını kopyala → layer cache'i manifest değişmedikçe kullanılır.
# Kod değişse bile npm install tekrar çalışmaz.
COPY package.json package-lock.json* ./

# npm ci:
#   - package-lock.json'u SÖZLEŞME gibi kullanır, tam versiyon uyumu
#   - node_modules'u sıfırdan kurar, deterministik
#   - devDependencies atlanır (production flag)
# package-lock.json yoksa npm install fallback'i otomatik devreye girer.
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      echo "WARN: package-lock.json missing, falling back to npm install" && \
      npm install --omit=dev; \
    fi

# --- Final stage ---
FROM node:20-alpine

# wget healthcheck için gerekli — alpine'da curl yok, busybox wget var ama
# bazı imajlarda eksik olabiliyor. Açık tutmak için ekliyoruz (~200KB).
RUN apk add --no-cache wget

WORKDIR /app

# root değil — security hardening. node:20-alpine'da 'node' user UID 1000 hazır.
# production'da root ile çalışmak CVE riski.
USER node

COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node db ./db

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Docker healthcheck: orchestrator (compose, swarm, k8s) container'ın
# gerçekten sağlıklı olup olmadığını bilsin.
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health/ready || exit 1

CMD ["node", "src/index.js"]