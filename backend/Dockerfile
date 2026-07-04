FROM node:20-alpine AS build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
COPY backend/sql ./sql
RUN npm run build

FROM node:20-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/sql ./sql
COPY config /app/config
EXPOSE 3001
CMD ["node", "dist/server.js"]
