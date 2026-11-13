# Use Node 20 (Next 15)
FROM node:20-alpine AS base

WORKDIR /app
RUN apk add --no-cache libc6-compat

# ---- Install + build (single stage so .bin symlinks stay intact) ----
FROM base AS builder

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json* ./

RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm ci --ignore-scripts

COPY . .

# NEXT_PUBLIC_* are inlined at build time. Override with --build-arg for a customer LAN.
ARG NEXT_PUBLIC_API_BASE_URL='http://127.0.0.1:8000/api/'
ARG NEXT_PUBLIC_AES_SECRET_KEY='change-me-hex-secret'
ARG NEXT_PUBLIC_AES_IV='change-me-hex-iv'
ARG NEXT_PUBLIC_APP_PROTOCOL='http'
ARG NEXT_PUBLIC_APP_DOMAIN='mart.local'
ARG NEXT_PUBLIC_APP_PORT='3003'

ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_AES_SECRET_KEY=$NEXT_PUBLIC_AES_SECRET_KEY \
    NEXT_PUBLIC_AES_IV=$NEXT_PUBLIC_AES_IV \
    NEXT_PUBLIC_APP_PROTOCOL=$NEXT_PUBLIC_APP_PROTOCOL \
    NEXT_PUBLIC_APP_DOMAIN=$NEXT_PUBLIC_APP_DOMAIN \
    NEXT_PUBLIC_APP_PORT=$NEXT_PUBLIC_APP_PORT

RUN NODE_ENV=production ./node_modules/.bin/next build

# ---- Production image ----
FROM base AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3003
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3003

CMD ["node", "server.js"]
