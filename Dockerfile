# Estágio 1: Build do Frontend (React)
FROM node:18-alpine as builder

WORKDIR /app

# Copia arquivos de dependência
COPY package*.json ./

# Instala todas as dependências (incluindo dev dependencies para o build)
RUN npm ci

# Copia o código fonte
COPY . .

# Compila o projeto (gera a pasta dist)
RUN npm run build

# Estágio 2: Servidor de Produção (Node.js Backend)
FROM node:18-alpine

WORKDIR /app

# Copia arquivos de dependência
COPY package*.json ./

# Instala apenas dependências de produção (Express, Axios, SSH, etc)
RUN npm ci --omit=dev

# Copia o frontend compilado do estágio anterior
COPY --from=builder /app/dist ./dist

# Copia o código do backend e script de inicialização
COPY server.js .
COPY docker-entrypoint.sh .

# Corrige quebras de linha do Windows (caso existam) e dá permissão de execução
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

# Define a porta
ENV PORT=80
EXPOSE 80

# Define o ponto de entrada
ENTRYPOINT ["./docker-entrypoint.sh"]

# Comando para iniciar o servidor
CMD ["node", "server.js"]
