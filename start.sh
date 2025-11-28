#!/bin/sh
echo "Iniciando deploy..."

if command -v docker-compose &> /dev/null; then
    echo "Usando comando: docker-compose"
    docker-compose up -d --build
elif docker compose version &> /dev/null; then
    echo "Usando comando: docker compose"
    docker compose up -d --build
else
    echo "❌ Erro: Nem 'docker-compose' nem 'docker compose' foram encontrados."
    echo "Instale o Docker Compose ou verifique sua instalação."
    exit 1
fi

echo "✅ Sucesso! Acesse http://localhost:8055"