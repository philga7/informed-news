# syntax=docker/dockerfile:1

FROM oven/bun:1.4.3 AS kite-build
WORKDIR /src
COPY apps/kite /src/apps/kite
WORKDIR /src/apps/kite
RUN bun install --frozen-lockfile && bun run build

FROM node:22-bookworm-slim AS server-build
WORKDIR /src/mvp/server
COPY mvp/server/package.json mvp/server/package-lock.json ./
RUN npm ci
COPY mvp/server/tsconfig.json mvp/server/tsconfig.build.json ./
COPY mvp/server/src ./src
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
COPY mvp/server/package.json mvp/server/package-lock.json /app/mvp/server/
WORKDIR /app/mvp/server
RUN npm ci --omit=dev && npm cache clean --force
COPY mvp/server/config /app/mvp/server/config
COPY --from=server-build /src/mvp/server/dist /app/mvp/server/dist
COPY --from=kite-build /src/apps/kite/build /app/apps/kite/build
COPY --from=kite-build /src/apps/kite/node_modules /app/apps/kite/node_modules
COPY --from=kite-build /src/apps/kite/package.json /app/apps/kite/package.json
RUN mkdir -p /app/mvp/data && chown -R node:node /app
USER node
ENV NODE_ENV=production
ENV PORT=3001
ENV KITE_BUILD_DIR=/app/apps/kite/build
EXPOSE 3001
CMD ["node", "dist/index.js"]
