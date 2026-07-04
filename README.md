# Dashboard de Acompanhamento de Tickets

Dashboards de acompanhamento de tickets em **português e inglês**, alimentados por planilhas exportadas manualmente do **Wrike**, **Microsoft Loop** e **Office 365**. Os dados passam por uma arquitetura medallion (bronze → silver → gold) em **ClickHouse** e são visualizados em um **frontend web customizado** (React) e em dois dashboards do **Apache Superset** (PT e EN).

## Arquitetura

```
Fontes (exportação manual: Wrike, Loop, Office 365 → Excel/CSV)
        │ upload via navegador
        ▼
192.168.56.132 — Docker
  • frontend: React (Vite) servido por Nginx (porta 80)
  • backend: Node/Express TypeScript (porta 3001)
    - POST /api/upload → parseia Excel (SheetJS), grava bronze,
      executa SQL de reconstrução silver/gold
    - GET /api/* → consultas na gold para o frontend
        ▼
192.168.56.127 — ClickHouse, banco `tickets`
  bronze_* → silver_* → gold_*
        ▲
192.168.56.128 — Superset (2 dashboards: PT e EN, lendo a gold)
```

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite, TypeScript, Nginx (produção) |
| Backend | Node.js + Express, TypeScript, SheetJS (xlsx), multer |
| Banco | ClickHouse (HTTP, porta 8123), banco `tickets` |
| BI | Apache Superset (Docker) + driver `clickhouse-connect` |
| Deploy | Docker Compose (servidor 192.168.56.132) |
| Testes | Vitest (28 unitários + 1 integração) |

## Quickstart

Pré-requisito: ClickHouse acessível em `192.168.56.127:8123` (veja [docs/instalacao.md](docs/instalacao.md)).

```bash
# 1. Criar schema no ClickHouse (banco tickets, tabelas e views gold)
cd backend
cp .env.example .env   # ajustar credenciais do ClickHouse se necessário
npm install
npm run setup-db

# 2. Subir os containers (no servidor 192.168.56.132, raiz do repo com .env)
docker compose up -d --build

# 3. Abrir o app
# http://192.168.56.132  → Dashboard e página de Upload
```

Superset: http://192.168.56.128:8088 — dashboards "Acompanhamento de Tickets (PT)" e "Ticket Tracking (EN)". Importação a partir de `superset/exports/`: veja [superset/README.md](superset/README.md).

## Testes

```bash
cd backend
npm test                              # unitários (parser, classificador, SQL, API)
RUN_INTEGRATION=1 npm test            # inclui integração (requer ClickHouse acessível)

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
├── superset/         # exports dos dashboards + guia de importação
├── config/           # area-rules.json (palavras-chave Financeiro/Estoque)
├── docs/             # documentação do projeto
└── docker-compose.yml
```
