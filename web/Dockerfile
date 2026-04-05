FROM node:22-alpine AS base

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder

ENV DATABASE_URL=postgresql://savepoint:changeme@postgres:5432/savepoint
ENV AUTH_SECRET=build-only-secret
ENV AUTOMATION_CRON_SECRET=build-only-secret
ENV AUTH_TRUST_HOST=true

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM base AS tools

ENV DATABASE_URL=postgresql://savepoint:changeme@postgres:5432/savepoint
ENV AUTH_SECRET=build-only-secret
ENV AUTOMATION_CRON_SECRET=build-only-secret
ENV AUTH_TRUST_HOST=true

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate

FROM node:22-alpine AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

WORKDIR /app

RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nextjs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
