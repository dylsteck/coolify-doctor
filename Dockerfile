# Multi-stage Node image: compile TypeScript, run compiled JS only.
# Mount host paths at AGENT_WORKSPACE for Cursor agents (Coolify volumes or docker run -v).
# Entrypoint starts an in-container Redis on 127.0.0.1:6379 for Chat SDK state.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache ca-certificates wget redis su-exec git
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1
ENTRYPOINT ["/entrypoint.sh"]
