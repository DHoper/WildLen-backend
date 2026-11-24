# syntax=docker/dockerfile:1

# ── Base: Node 22 + OpenSSL (required by the Prisma query engine on Alpine) ──
FROM node:22-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app

# ── Build: install everything, generate the Prisma client, compile TypeScript ──
FROM base AS build
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ── Runtime: production dependencies + compiled output only ──
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall runs `prisma generate` for this platform.
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Local uploads are only used without Cloudinary; mount a volume here if you rely on them.
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health >/dev/null || exit 1
# Apply pending migrations, then start the API.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/server.js"]
