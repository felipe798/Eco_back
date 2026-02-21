# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine AS production

WORKDIR /app

# Necesario para bcryptjs y algunas dependencias nativas
RUN apk add --no-cache libc6-compat

COPY package*.json ./

RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

# Fly.io asigna el puerto via variable de entorno
EXPOSE 3000

CMD ["node", "dist/main.js"]