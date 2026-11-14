FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 MARSWALK_DB=/data/marswalk-v2.sqlite
VOLUME /data
EXPOSE 3000
CMD ["node","--experimental-sqlite","server/index.mjs"]
