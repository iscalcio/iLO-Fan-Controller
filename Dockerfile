FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
# Instala dependências de desenvolvimento para build do frontend
RUN npm install
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
# Instala somente dependências de produção
RUN npm install --omit=dev
# Copia artefatos de build e servidor
COPY --from=builder /app/dist ./dist
COPY server.js ./server.js
# Dados persistentes ficam em /app/data
VOLUME ["/app/data"]
EXPOSE 8000
CMD ["npm","start"]

