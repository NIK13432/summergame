FROM node:22-slim
WORKDIR /app
COPY server/package*.json server/
COPY web/package*.json web/
RUN npm --prefix server ci && npm --prefix web ci
COPY . .
RUN npm --prefix web run build
ENV PORT=3000 DB_PATH=/app/data/game.db
VOLUME /app/data
EXPOSE 3000
CMD ["npm", "--prefix", "server", "start"]
