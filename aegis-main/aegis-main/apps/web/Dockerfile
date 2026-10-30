# security-app — imagem de produção (F1.2 do plano de frota).
#
# Antes desta imagem, a borda montava a ÁRVORE DE FONTE do security-app como
# volume e, no primeiro boot, rodava `npm install` + `next build` dentro da
# caixa: ~10 minutos até a tela abrir, com o resultado vivendo num volume que
# não corresponde a commit nenhum. Aqui o build acontece uma vez, no runner do
# CI, e a caixa só baixa camadas.
#
# O que tornou a imagem ÚNICA possível: os tokens de mapa saíram de
# `NEXT_PUBLIC_*` (que o `next build` inlina no bundle, um build por cliente)
# para `/api/config`, lido em runtime. Ver lib/config/runtime.ts.
#
# Build (NUNCA no PC do dono — 16 GB):
#   podman build -t ghcr.io/safe-core/aegis-security-app:vX.Y.Z security-app/
#
# Runtime: só variáveis de ambiente. Nenhum build-arg carrega segredo.

# ── deps ──────────────────────────────────────────────────────────────────
# Instala com TODAS as dependências (inclusive dev): o `next build` precisa do
# typescript para ler os `paths` do tsconfig — sem ele os aliases `@/*` não
# resolvem e o build quebra. Por isso NÃO se seta NODE_ENV=production aqui.
FROM docker.io/library/node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `scripts/` entra JUNTO com os manifestos porque o `postinstall` do
# package.json é `node scripts/link-cesium.mjs`: sem o arquivo, o `npm ci`
# morre com "Cannot find module '/app/scripts/link-cesium.mjs'". Foi assim que
# o primeiro build no runner falhou.
COPY scripts ./scripts
# --legacy-peer-deps é obrigatório: React 19 + Radix/testing-library têm peers
# não resolvidos (mesma flag do desenvolvimento).
#
# Os install scripts RODAM (nada de --ignore-scripts): pacotes com binário
# nativo dependem deles, e o preço de pular é um erro obscuro no `next build`.
# O postinstall daqui (link-cesium) cria um symlink em /app/public deste
# estágio, que nunca é copiado adiante — inofensivo.
RUN npm ci --legacy-peer-deps

# ── builder ───────────────────────────────────────────────────────────────
FROM docker.io/library/node:22-bookworm-slim AS builder
WORKDIR /app

# O `next build` do security-app estoura o heap default do Node.
ENV NODE_OPTIONS=--max-old-space-size=3072
ENV NEXT_TELEMETRY_DISABLED=1

# Versão do SDK Python exposta na UI. Em desenvolvimento o next.config lê o
# pyproject.toml do repo vizinho; aqui esse caminho não existe, então o CI
# injeta o valor. Ausente = "dev" (degradação honesta, não build quebrado).
ARG AEGIS_SDK_VERSION=""
ENV AEGIS_SDK_VERSION=${AEGIS_SDK_VERSION}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Guarda de contrato — a razão de existir da F1.2.
#
# Estes dois ARG existem para SEREM RECUSADOS. Declarados, um
# `--build-arg NEXT_PUBLIC_MAPBOX_TOKEN=...` chega aqui como variável e o build
# morre; sem declará-los, a passagem seria silenciosamente ignorada pelo Docker
# e a guarda nunca dispararia. O `.env*` no contexto é o outro caminho de
# contaminação: o Next carrega .env.local no build e inlina o que achar.
#
# Em qualquer um dos casos a imagem voltaria a ser uma-por-cliente sem ninguém
# perceber — o build tem de parar, alto e claro.
ARG NEXT_PUBLIC_MAPBOX_TOKEN=""
ARG NEXT_PUBLIC_CESIUM_ION_TOKEN=""
RUN set -e; \
    if [ -n "${NEXT_PUBLIC_MAPBOX_TOKEN}${NEXT_PUBLIC_CESIUM_ION_TOKEN}" ]; then \
      echo "ERRO: token de mapa passado como build-arg — ele seria INLINADO no bundle."; \
      echo "      Estes tokens são de RUNTIME: passe MAPBOX_TOKEN / CESIUM_ION_TOKEN"; \
      echo "      como variável de ambiente do CONTAINER. Ver lib/config/runtime.ts."; \
      exit 1; \
    fi; \
    if ls .env .env.local .env.production .env.production.local 2>/dev/null | grep -q .; then \
      echo "ERRO: arquivo .env no contexto do build. O Next o carrega e inlina"; \
      echo "      qualquer NEXT_PUBLIC_* que encontrar. Confira o .dockerignore."; \
      exit 1; \
    fi

# As SPAs da Safe Tag (portaria/visitante/morador) são ARTEFATO: fonte em
# ../safetag-web, buildadas para public/ e fora do git. Num clone limpo do CI
# elas não existem — quem constrói a release precisa rodar
# safetag-web/deploy-public-spas.sh ANTES do build. Aviso, não erro: uma
# instalação sem Safe Tag é legítima e não deve travar a release.
RUN for spa in portaria visitante morador; do \
      [ -d "public/$spa" ] || echo "AVISO: public/$spa ausente — a superfície Safe Tag correspondente não será servida por esta imagem."; \
    done

RUN npm run build

# ── runtime ───────────────────────────────────────────────────────────────
FROM docker.io/library/node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002
ENV HOSTNAME=0.0.0.0

# `output: 'standalone'` produz um server.js com só o que o app importa. Ele
# NÃO inclui public/ nem .next/static — os dois vêm à mão, como manda o Next.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Assets do Cesium servidos em /cesium (CESIUM_BASE_URL). Em desenvolvimento
# isto é um symlink para node_modules (scripts/link-cesium.mjs); na imagem tem
# de ser ARQUIVO DE VERDADE — o standalone não carrega node_modules inteiro, e
# um symlink pendurado daria 404 no globo.
COPY --from=builder --chown=node:node /app/node_modules/cesium/Build/Cesium ./public/cesium

USER node
EXPOSE 3002

# Sonda a config de runtime: é anônima (sem cookie), barata e prova que o
# servidor Next está de pé E servindo rota de app — não só aceitando TCP.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3002)+'/api/config').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

LABEL org.opencontainers.image.title="AEGIS security-app" \
      org.opencontainers.image.description="Console do operador AEGIS (Safe Core)" \
      org.opencontainers.image.vendor="Safe-Core Technologies" \
      org.opencontainers.image.source="https://github.com/Safe-Core/security-app"
# Preenchidos pelo CI da release. `version` é o que o aegis-update.sh lê.
ARG AEGIS_VERSION="0.0.0-dev"
ARG GIT_SHA=""
LABEL org.opencontainers.image.version="${AEGIS_VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}"

CMD ["node", "server.js"]
