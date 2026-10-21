FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
# Prisma CLI must remain available: the selected connector is generated on startup.
RUN npm ci --ignore-scripts
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/prisma ./prisma
COPY scripts ./scripts
RUN mkdir -p /app/data && chmod +x /app/scripts/start.sh
VOLUME ["/app/data"]
EXPOSE 8787
CMD ["npm", "start"]
