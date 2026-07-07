# Dashboards Superset — Acompanhamento de Tickets

Dashboards do Apache Superset construídos sobre as views **gold** do ClickHouse
(`tickets`), exportados e versionados em `superset/exports/`.

## Dashboards

| Dashboard | Idioma | Conteúdo |
|---|---|---|
| Acompanhamento de Tickets (PT) | Português | 4 big numbers + 5 tabelas (colunas `step_pt`, `task_name`) |
| Ticket Tracking (EN) | Inglês | Mesmos charts com títulos em inglês (colunas `step_en`, `task_name_en`) |

Cada dashboard contém:

- **Big numbers** (linha 1): Total de Tickets / Total Tickets, Urgentes Abertos / Urgent Open, Itens Abertos / Open Items, Concluídos / Completed
- **Tabelas**: Distribuição por Status / Status Distribution, Distribuição por Prioridade / Priority Distribution, Níveis de Prioridade (P0–P5) / Priority Levels (P0–P5), Top 5 Financeiro / Top 5 Finance, Top 5 Estoque / Top 5 Inventory, Top 5 Aguardando Cliente / Top 5 Waiting Customer

## Pré-requisito: driver ClickHouse

O Superset precisa do driver `clickhouse-connect` instalado no ambiente Python
do Superset. Se o Superset roda em Docker:

```bash
docker exec -u root superset uv pip install --python /app/.venv/bin/python clickhouse-connect
docker restart superset
```

> Em imagens mais antigas do Superset (sem venv), `docker exec superset pip install clickhouse-connect` é suficiente.

## Conexão de banco

- **Engine:** ClickHouse Connect (HTTP)
- **SQLAlchemy URI:** `clickhousedb://<user>:<senha>@192.168.56.127:8123/tickets`
- **Nome da conexão:** `ClickHouse Tickets`

> Os exports **não incluem senhas**. Ao importar, o Superset pedirá a senha da
> conexão de banco. As credenciais de admin desta instância interna são
> gerenciadas no próprio servidor (não estão versionadas neste repositório).

## Importação

1. Acesse o Superset → **Dashboards**
2. Clique no botão **Import Dashboard** (ícone de seta para cima, no canto superior direito)
3. Selecione o arquivo zip de `superset/exports/`
4. Informe a senha da conexão `ClickHouse Tickets` quando solicitado
5. Repita para o segundo zip

## Datasets esperados (views gold no ClickHouse)

| Dataset | Conteúdo |
|---|---|
| `gold_big_numbers` | total_tickets, urgent_open, open_items, completed |
| `gold_status_distribution` | status, step_pt, step_en, qty, pct |
| `gold_priority_distribution` | priority_label, qty, pct |
| `gold_priority_levels` | priority_level (P0–P5), qty, pct |
| `gold_top5_financeiro` | top 5 tickets da área Financeiro por prioridade |
| `gold_top5_estoque` | top 5 tickets da área Estoque por prioridade |
| `gold_top5_waiting_customer` | top 5 tickets com status Waiting Customer por prioridade |

## Exports

Os arquivos em `superset/exports/` foram gerados via API de export do Superset
(`GET /api/v1/dashboard/export/`) e podem ser reimportados em qualquer
instância Superset com o driver `clickhouse-connect` disponível.
