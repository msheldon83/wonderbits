# One image: the built game and the server that keeps accounts for it.
# Run it against any Postgres by setting DATABASE_URL.

FROM node:22-slim AS game
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY content ./content
COPY src ./src
# The commit being built, for tying what children did to the levels as they were: --build-arg APP_VERSION=$(git rev-parse --short HEAD)
ARG APP_VERSION=dev
ENV VITE_ACCOUNTS=1 APP_VERSION=$APP_VERSION
RUN npx vite build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/migrations ./migrations
COPY server/src ./src
COPY --from=game /app/dist /app/dist
ENV STATIC_DIR=/app/dist PORT=8080
EXPOSE 8080
USER node
CMD ["node", "--import", "tsx", "src/index.ts"]
