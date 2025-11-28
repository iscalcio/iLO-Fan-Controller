#!/bin/sh

# Caminho onde o Frontend compilado está localizado no container Node.js
CONFIG_FILE="/app/dist/env-config.js"

# Garante que o diretório existe
mkdir -p /app/dist

echo "Gerando configuração de ambiente em $CONFIG_FILE..."

# Cria o arquivo JS dinamicamente com os valores das variáveis de ambiente
echo "window.__ENV__ = {" > $CONFIG_FILE
echo "  ILO_HOST: \"${ILO_HOST}\"," >> $CONFIG_FILE
echo "  ILO_USERNAME: \"${ILO_USERNAME}\"," >> $CONFIG_FILE
echo "  ILO_PASSWORD: \"${ILO_PASSWORD}\"" >> $CONFIG_FILE
echo "};" >> $CONFIG_FILE

# Executa o comando padrão (node server.js)
exec "$@"