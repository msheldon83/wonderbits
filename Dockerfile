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
ENV VITE_ACCOUNTS=1
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
