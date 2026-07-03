# Design — Dashboard de Acompanhamento de Tickets (PT/EN)

**Data:** 2026-07-03
**Repositório:** https://github.com/wmarrane/ticketdashboard

## Objetivo

Construir dashboards de acompanhamento de tickets abertos em português e inglês, alimentados por planilhas exportadas manualmente do Wrike, Microsoft Loop e Office 365, com arquitetura medallion (bronze/silver/gold) em ClickHouse, visualização no Superset e em frontend web customizado.

## Requisitos funcionais

**Big numbers:**
1. Total de tickets
2. Total de urgentes abertos
3. Total de itens abertos
4. Total de concluídos

**Tabelas:**
- Distribuição por status (qtd e %)
- Distribuição por prioridade (Urgente!/Alta/Normal/Baixa — qtd e %)
- Níveis de prioridade P0–P5 (qtd e %)
- Top 5 Financeiro (tickets abertos, ordenados por prioridade, P0 primeiro)
- Top 5 Estoque (idem)

**Idiomas:** frontend com seletor PT/EN; Superset com dois dashboards separados (PT e EN).

**Referência visual:** aba "Dashboard" da planilha `personaladmin/2026_07_02_Cards_Ituran_Contrato_Squad.xlsx`.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Visualização | Superset **e** frontend customizado |
| Ranking Top 5 | Colunas Prioridade/Priority (P0 primeiro) |
| Área Financeiro/Estoque | Classificação por palavras-chave no título |
| Ingestão | 100% manual (exportação de planilhas das fontes) |
| Carga | Tela de upload no frontend |
| Stack | React (Vite) + Node/Express em TypeScript |
| Orquestração | Scripts SQL executados pelo backend a cada upload (sem MVs, sem Airflow) |

## Arquitetura

```
Fontes (exportação manual: Wrike, Loop, Office 365 → Excel/CSV)
        │ upload via navegador
        ▼
192.168.56.132 — Docker
  • frontend: React (Vite) servido por Nginx (porta 80)
  • backend: Node/Express TypeScript (porta 3001)
    - POST /upload → parseia Excel (SheetJS), grava bronze,
      executa SQL de reconstrução silver/gold
    - GET /api/* → consultas na gold para o frontend
        ▼
192.168.56.127 — ClickHouse, banco `tickets`
  bronze_* → silver_* → gold_*
        ▲
192.168.56.128 — Superset (2 dashboards: PT e EN, lendo a gold)
```

**Fluxo:** exportar planilha da fonte → upload no frontend → backend valida e insere na bronze com metadados → scripts SQL reconstroem silver e gold → frontend e Superset leem a gold.

## Modelo de dados

### Bronze — `bronze_tickets_raw`
- Append-only; todas as colunas da planilha como String, sem transformação
- Metadados: `source` (wrike | loop | office365), `file_name`, `load_id`, `loaded_at`, `row_number`
- Histórico completo de cargas; nada é apagado

### Silver — `silver_tickets`
Reconstruída a cada carga a partir do último lote de cada fonte na bronze.

- **Deduplicação** por `ticket_id`; em conflito entre fontes, vale a carga mais recente
- **Tipagem:** datas, IDs; normalização de espaços e caracteres
- **`step_pt` / `step_en`** derivados do status Wrike (mesmo de-para das fórmulas da planilha):

| Status Wrike | Step PT | Step EN |
|---|---|---|
| Backlog | Não Iniciado | Not Started |
| In Progress | Em análise pelo fornecedor | Under Vendor Analysis |
| Development Team | Correção pelo time de dev | Development by Vendor Dev Team |
| Pendente Terceiros | Chamado Oracle | Oracle Ticket |
| Waiting Customer | Aguardando retorno do Ituran | Waiting for Ituran's Response |
| Validation | UAT | UAT |
| Completed | Em produção | In Production |

- **`priority_label`** (Urgente!/Alta/Normal/Baixa) e **`priority_level`** (P0–P5)
- **`is_open`** = status ∉ {Completed, Cancelled, Stopped}
- **`area`** = classificação por palavras-chave no título da tarefa, regras em `config/area-rules.json` (versionado):
  - Financeiro: fatura, pagamento, invoice, CNAB, NFS-e, fiscal, cobrança, billing, contas…
  - Estoque: estoque, inventário, item, remessa, CD, transferência, warehouse…
  - Sem correspondência: Outros

### Gold — views/tabelas de consumo
Todas com rótulos em PT e EN (colunas `_pt`/`_en`) para servir os dois idiomas sem duplicar dados.

- `gold_big_numbers`: total de tickets, urgentes abertos, itens abertos, concluídos
- `gold_status_distribution`: qtd e % por status
- `gold_priority_distribution`: qtd e % por prioridade
- `gold_priority_levels`: qtd e % por nível P0–P5
- `gold_top5_financeiro`: top 5 abertos da área Financeiro por prioridade
- `gold_top5_estoque`: top 5 abertos da área Estoque por prioridade

**Definições:**
- *Urgentes abertos* = `priority_label = 'Urgente!'` e `is_open`
- *Itens abertos* = `is_open`
- *Concluídos* = status Completed

## Dashboards

### Layout (idêntico nos dois idiomas)

```
┌─────────────────────────────────────────────────────────┐
│  PAINEL DE ACOMPANHAMENTO DE TICKETS    [seletor PT/EN] │
├────────────┬────────────┬────────────┬──────────────────┤
│   Total    │  Urgentes  │   Itens    │    Concluídos    │
│ de Tickets │  Abertos   │  Abertos   │                  │
├────────────┴──────┬─────┴────────────┼──────────────────┤
│  Distribuição     │  Distribuição    │   Top 5          │
│  por Status       │  por Prioridade  │   Financeiro     │
├───────────────────┼──────────────────┼──────────────────┤
│  Níveis de        │                  │   Top 5          │
│  Prioridade P0–P5 │                  │   Estoque        │
└───────────────────┴──────────────────┴──────────────────┘
```

### Frontend React
- **Página Dashboard:** big numbers + 5 tabelas, toggle PT/EN no topo
- **Página Upload:** arrastar/soltar Excel ou CSV, seleção da fonte, resultado da carga (linhas aceitas/rejeitadas com motivo), histórico de uploads
- Colunas dos Top 5: ID, tarefa, prioridade (P0–P5), step, responsável, vencimento

### Superset
- Conexão `clickhousedb://` para a camada gold
- Dashboards "Acompanhamento de Tickets (PT)" e "Ticket Tracking (EN)"
- Export `.zip` versionado em `superset/` + guia de importação em `docs/`

## Estrutura do repositório

```
├── backend/          # Express + ETL (parser Excel, execução SQL)
│   └── sql/          # scripts das 3 camadas (setup + transformações)
├── frontend/         # React (Vite) — dashboard + upload
├── superset/         # export dos dashboards + guia de importação
├── config/           # area-rules.json (palavras-chave)
├── docs/             # documentação do projeto
└── docker-compose.yml
```

## Deploy

- `docker-compose.yml` no 192.168.56.132: serviços `backend` (3001) e `frontend` (Nginx, 80)
- Configuração via `.env` (host/porta/credenciais do ClickHouse) — sem senhas no código
- `backend/sql/setup.sql` cria banco `tickets` e todas as tabelas no 192.168.56.127

## Tratamento de erros

- Upload valida extensão (.xlsx/.csv) e colunas obrigatórias antes de gravar
- Linhas sem ID ou sem status são rejeitadas e reportadas na tela com o motivo
- Falha na transformação silver/gold não afeta a bronze; erro registrado no histórico de cargas

## Testes

- Unitários (Vitest): parser de planilha e regras de classificação de área
- Integração: pipeline completo (upload → bronze → silver → gold) usando a planilha de exemplo como fixture
- Verificação manual do dashboard no navegador (PT e EN) antes de concluir

## Documentação a produzir (`docs/`)

1. Visão geral e arquitetura
2. Dicionário de dados das camadas bronze/silver/gold
3. Guia de operação: como exportar das fontes e fazer upload
4. Guia de instalação: ClickHouse, deploy dos containers, importação dos dashboards no Superset
