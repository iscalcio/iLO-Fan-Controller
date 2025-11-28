<img width="2647" height="1951" alt="Captura de tela 2025-11-27 223827" src="https://github.com/user-attachments/assets/144ed6a8-4725-4a67-9f97-aae6af94d511" />

<img width="1484" height="1850" alt="Captura de tela 2025-11-27 223853" src="https://github.com/user-attachments/assets/769da7ce-6d4e-4376-9fca-3b700790044f" />




# iLO Fans Controller

Dashboard para monitoramento e controle das ventoinhas em servidores HP ProLiant via iLO 4 desbloqueado.

## Visão Geral

- Frontend (Vite/React) servido como SPA pelo backend.
- Backend (Node.js/Express) expõe APIs para leitura de sensores e controle de fans via SSH/Redfish.
- Porta padrão do backend: `8000`.
- Configuração do iLO via variáveis de ambiente ou cabeçalhos HTTP.


- Acesse: `http://localhost:8000`
- Variáveis de ambiente suportadas no Compose:
  - `ILO_HOST`, `ILO_USER`, `ILO_PASS`
  - `SYS_USER`, `SYS_PASS`
- Volume persistente:
  - `./data:/app/data` (histórico de temperaturas)
- Healthcheck: consulta `GET /api/auth/info`

### Scripts de automação

- Windows (PowerShell):
  - `scripts/run-compose.ps1` (sobe com `--build`)
  - `scripts/restart-compose.ps1` (down/up com `--build`)
  - `scripts/down-compose.ps1` (opcional `-RemoveVolumes`)
  - `scripts/logs.ps1` (opcional `-Service ilo-fan-controller`)
  - `scripts/backup-data.ps1` (cria ZIP da pasta `data` em `backups/`)
  - `scripts/health.ps1` (testa `auth/info` e `sensors`)
- Linux (Ubuntu/Debian):
  - `scripts/run-compose.sh` (aceita `ENV_FILE`, padrão `.env`)
  - `scripts/restart-compose.sh` (aceita `ENV_FILE`, padrão `.env`)
  - `scripts/down-compose.sh` (use `-v` para remover volumes)
  - `scripts/logs.sh` (opcional nome do serviço)
  - `scripts/backup-data.sh` (gera `backups/data-<timestamp>.tar.gz`)
  - `scripts/health.sh` (testa `auth/info` e `sensors`)

### Exemplo de `.env`

```env
ILO_HOST=192.168.15.103
ILO_USER=fan
ILO_PASS=20134679
SYS_USER=admin
SYS_PASS=admin
```

## Executar via Docker Hub

### Baixar a imagem

```bash
docker pull iscalcio/ilo-fan-controller:latest
```

### Linux/macOS

```bash
docker run -d --rm \
  -p 8000:8000 \
  -e ILO_HOST="ilo-ip-address" \
  -e ILO_USER="ilo-user" \
  -e ILO_PASS="ilo-password" \
  iscalcio/ilo-fan-controller:latest
```

### Windows PowerShell

```powershell
docker run -d --rm -p 8000:8000 `
  -e "ILO_HOST=ilo-ip-address" `
  -e "ILO_USER=ilo-user" `
  -e "ILO_PASS=ilo-password" `
  iscalcio/ilo-fan-controller:latest
```

## Configuração

- Variáveis de ambiente principais:
  - `PORT`: porta HTTP do backend (padrão `8000`).
  - `ILO_HOST`: endereço do iLO.
  - `ILO_USER` ou `ILO_USERNAME`: usuário do iLO.
  - `ILO_PASS` ou `ILO_PASSWORD`: senha do iLO.
- Alternativa via cabeçalhos HTTP nas requisições:
  - `x-ilo-host`, `x-ilo-username`, `x-ilo-password`.

## Segurança

- Não exponha suas credenciais do iLO publicamente.
- Prefira definir `ILO_*` como variáveis de ambiente.

## Licença

Free

## 

MIT
