# Guia de Instalação

## Pré-requisitos

| Servidor | Software |
|---|---|
| 192.168.56.127 | ClickHouse Server com interface HTTP na porta 8123, acessível pelos servidores 128 e 132 |
| 192.168.56.128 | Docker + container Apache Superset (`apache/superset`) na porta 8088 |
| 192.168.56.132 | Docker + Docker Compose; porta 80 livre (a 3001 do backend é interna à rede do Compose, não publicada no host) |
| Máquina de build/dev | Node.js 20+, npm, git |

## 1. Configurar o `.env`

O backend lê a configuração via variáveis de ambiente (`backend/src/config.ts`). Crie o `.env` a partir do exemplo:

```bash
cd backend
cp .env.example .env
```

| Variável | Padrão | Descrição |
|---|---|---|
| `CLICKHOUSE_URL` | `http://192.168.56.127:8123` | URL HTTP do ClickHouse |
| `CLICKHOUSE_USER` | `default` | Usuário |
| `CLICKHOUSE_PASSWORD` | *(vazio)* | Senha — **não** commitar |
| `CLICKHOUSE_DATABASE` | `tickets` | Banco |
| `PORT` | `3001` | Porta do backend |

Para o deploy com Compose, o mesmo `.env` deve existir na **raiz do repositório** no servidor 132 (o `docker-compose.yml` usa `env_file: .env`).

## 2. Criar o schema no ClickHouse

`backend/sql/setup.sql` cria o banco `tickets`, as tabelas `bronze_tickets_raw`, `load_history`, `silver_tickets` e as 6 views gold. É idempotente (`IF NOT EXISTS` / `CREATE OR REPLACE VIEW`) — pode ser reexecutado com segurança.

```bash
cd backend
npm install
npm run setup-db
```

Saída esperada: uma linha `OK: ...` por statement e `Setup concluído.`

## 3. Deploy dos containers no 192.168.56.132

```bash
# no servidor 132
git clone https://github.com/wmarrane/ticketdashboard.git
cd ticketdashboard
# criar .env na raiz (mesmas variáveis da seção 1)
docker compose up -d --build
```

Serviços:

- **backend** — build de `backend/Dockerfile`, porta 3001 **apenas na rede interna do Compose** (`expose`, não publicada no host), configurado pelo `.env`.
- **frontend** — build de `frontend/Dockerfile` (React + Nginx), porta 80; o Nginx faz proxy de `/api/` para `backend:3001` (`frontend/nginx.conf`, `client_max_body_size 25m`).

Verificação: abrir **http://192.168.56.132** (dashboard) e `http://192.168.56.132/api/dashboard` (JSON das views gold).

Atualização após mudanças no código ou em `config/area-rules.json`:

```bash
git pull && docker compose up -d --build
```

## 4. Superset (192.168.56.128)

Resumo — o passo a passo completo está em [`superset/README.md`](../superset/README.md):

1. Instalar o driver ClickHouse no container:
   ```bash
   docker exec -u root superset uv pip install --python /app/.venv/bin/python clickhouse-connect
   docker restart superset
   ```
2. Criar a conexão de banco `ClickHouse Tickets` com URI `clickhousedb://<user>:<senha>@192.168.56.127:8123/tickets`.
3. Importar os dois zips de `superset/exports/` (Dashboards → Import Dashboard), informando a senha da conexão quando solicitado.

> O metastore do Superset é SQLite dentro do container — os exports versionados em `superset/exports/` são o backup dos dashboards.

## 5. Rodar em desenvolvimento (opcional)

```bash
# backend (porta 3001)
cd backend && npm install && npm run dev

# frontend (Vite, proxy /api → localhost:3001)
cd frontend && npm install && npm run dev
```

Testes: `npm test` em `backend/` e `frontend/`; a integração do pipeline roda com `RUN_INTEGRATION=1 npm test` (requer ClickHouse acessível).

## 6. Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| `setup-db` ou upload falha com erro de conexão/`ECONNREFUSED`/timeout | ClickHouse inacessível | Testar `curl http://192.168.56.127:8123/ping` (deve responder `Ok.`); verificar serviço ClickHouse e firewall entre 132↔127 |
| Erro de autenticação no ClickHouse (`Authentication failed`, código 516) | Credenciais erradas no `.env` | Corrigir `CLICKHOUSE_USER`/`CLICKHOUSE_PASSWORD` e recriar o container backend (`docker compose up -d backend`) |
| `docker compose up` falha com "port is already allocated" | Porta 80 ocupada no 132 | Identificar o processo (`docker ps`, `ss -ltnp`) e liberar a porta, ou ajustar o mapeamento em `docker-compose.yml` |
| Superset: "Could not load database driver: clickhousedb" | Driver `clickhouse-connect` ausente | Instalar no venv do container (seção 4, passo 1) e reiniciar o Superset |
| Dashboard do frontend vazio ou erro em `/api/dashboard` | Silver vazia (nenhuma carga) ou backend sem acesso ao ClickHouse | Fazer um upload na página Upload; conferir logs `docker compose logs backend` |
| Upload retorna "Fonte inválida" / "Extensão não suportada" | Fonte fora de wrike/loop/office365 ou arquivo que não é `.xlsx`/`.csv` | Corrigir a seleção/arquivo |
| Carga com `status = transform_error` no histórico | Falha no rebuild da silver (bronze permanece intacta) | Ver coluna `error` em `tickets.load_history`, corrigir a causa (ex.: ClickHouse) e reenviar o arquivo |
