FROM node:lts-alpine AS base

WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && \
  corepack prepare pnpm@latest --activate && \
  pnpm install --frozen-lockfile

COPY src/prisma/schema.prisma ./src/prisma/schema.prisma

RUN pnpm dlx prisma generate --schema=./src/prisma/schema.prisma

# Build the app
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/prisma ./src/prisma
COPY . .
RUN npm run build

# Production image
FROM base AS runner
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hono

COPY --from=builder --chown=hono:nodejs /app/dist ./dist
COPY --from=builder --chown=hono:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=hono:nodejs /app/package.json ./package.json

USER hono

EXPOSE 3000

CMD ["node", "dist/src/index.js"]