# Dashboard de Acompanhamento de Tickets

Dashboards de acompanhamento de tickets em **português e inglês**, alimentados por planilhas exportadas manualmente do **Wrike**, **Microsoft Loop** e **Office 365**. Os dados passam por uma arquitetura medallion (bronze → silver → gold) em **ClickHouse** e são visualizados em um **frontend web customizado** (React) e em dois dashboards do **Apache Superset** (PT e EN).

## Arquitetura

```
Fontes (exportação manual: Wrike, Loop, Office 365 → Excel/CSV)
        │ upload via navegador
        ▼
Docker Desktop (local) — docker compose
  • frontend: React (Vite) servido por Nginx — http://localhost
    - proxy /api → backend:3001
  • backend: Node/Express TypeScript (3001, interno à rede do Compose)
    - POST /api/upload → parseia Excel (SheetJS), grava bronze,
      executa SQL de reconstrução silver/gold
    - GET /api/* → consultas na gold para o frontend
        ▼
  • clickhouse: banco `tickets` — 127.0.0.1:8123
      bronze_* → silver_* → gold_*
        ▲
  • superset: http://localhost:8088 (2 dashboards: PT e EN, lendo a gold)
  • libretranslate: sob demanda (profile `translate`)
```

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite, TypeScript, Nginx (produção) |
| Backend | Node.js + Express, TypeScript, SheetJS (xlsx), multer |
| Banco | ClickHouse (HTTP, porta 8123), banco `tickets` |
| BI | Apache Superset 5.0.0 (Docker) + driver `clickhouse-connect` embutido no build |
| Deploy | Docker Compose no Docker Desktop (local) |
| Testes | Vitest (28 unitários + 1 integração) |

## Quickstart

Pré-requisito: Docker Desktop (o plano gratuito cobre uso pessoal). Veja [docs/instalacao.md](docs/instalacao.md).

```bash
# 1. Configurar o .env da raiz
cp .env.example .env
# ajustar CLICKHOUSE_USER/PASSWORD e as variáveis SUPERSET_*
# gerar a chave: openssl rand -base64 42

# 2. Subir a stack inteira
docker compose up -d --build

# 3. Abrir o app
# http://localhost       → Dashboard e página de Upload
# http://localhost:8088  → Superset (dashboards PT e EN)
```

Não há passo de criação de schema: o `backend/sql/setup.sql` é executado pelo ClickHouse no primeiro boot, e o `superset-init` faz o bootstrap do Superset e importa os dois dashboards. Detalhes em [superset/README.md](superset/README.md).

## Testes

```bash
cd backend
npm test                              # unitários (parser, classificador, SQL, API)
RUN_INTEGRATION=1 npm test            # inclui integração (requer o container clickhouse no ar)

cd frontend
npm test                              # unitários (i18n)
```

## Documentação

- [docs/arquitetura.md](docs/arquitetura.md) — servidores, fluxo de dados, decisões de design
- [docs/dicionario-de-dados.md](docs/dicionario-de-dados.md) — colunas de todas as tabelas/views, de-para status→step, regras de área
- [docs/operacao.md](docs/operacao.md) — exportar das fontes, upload, rejeições, reprocessamento
- [docs/instalacao.md](docs/instalacao.md) — pré-requisitos, .env, setup-db, deploy, Superset, troubleshooting
- [superset/README.md](superset/README.md) — importação dos dashboards Superset

## Estrutura do repositório

```
├── backend/          # Express + ETL (parser Excel, execução SQL)
│   └── sql/          # setup.sql (banco, tabelas, views gold)
├── frontend/         # React (Vite) — dashboard + upload
├── superset/         # Dockerfile, bootstrap, exports dos dashboards + guia
├── config/           # area-rules.json (palavras-chave Financeiro/Estoque)
├── scripts/          # migrate-from-vm.sh (migração das VMs, uso histórico)
├── docs/             # documentação do projeto
└── docker-compose.yml
```
