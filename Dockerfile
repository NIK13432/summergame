# Build stage: the full image has python/make/g++ in case better-sqlite3 must compile from source.
FROM node:22-bookworm AS build
WORKDIR /app
COPY server/package*.json server/
COPY web/package*.json web/
RUN npm --prefix server ci && npm --prefix web ci
COPY . .
RUN npm --prefix web run build && npm --prefix web prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /app /app
ENV PORT=3000 DB_PATH=/app/data/game.db
EXPOSE 3000
CMD ["npm", "--prefix", "server", "start"]
