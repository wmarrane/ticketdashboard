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

## Driver ClickHouse

Nada a fazer: o `clickhouse-connect` é instalado no **build** da imagem
(`superset/Dockerfile`), e não por `docker exec` depois de subir. Assim ele
sobrevive a qualquer recriação do container.

## Conexão de banco

- **Engine:** ClickHouse Connect (HTTP)
- **SQLAlchemy URI:** `clickhousedb://<user>:<senha>@clickhouse:8123/tickets`
- **Nome da conexão:** `ClickHouse Tickets`

O usuário, a senha e o banco vêm de `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` /
`CLICKHOUSE_DATABASE` no `.env` da raiz. As credenciais de admin do Superset
saem de `SUPERSET_ADMIN_USER` / `SUPERSET_ADMIN_PASSWORD` no mesmo arquivo —
que é gitignored e não está versionado.

## Importação

O `docker compose up -d` já importa os dois dashboards: o serviço one-shot
`superset-init` roda `superset/init.sh`, que faz o bootstrap do metastore, cria
o admin e importa os zips. Não há passo manual no caminho feliz.

### Por que os zips passam por adaptação antes do import

`superset/init.sh` não importa os zips diretamente — ele chama antes o
`superset/patch_export.py`, que gera uma cópia temporária corrigida. Dois
motivos, ambos verificados na prática:

1. O export mascara a senha como `XXXXXXXXXX` e preserva o host de origem
   (a VM `192.168.56.127`, aposentada). O import valida a conexão antes de
   gravar e recusa o bundle.

2. Os zips foram gerados por uma instância que rodava um build de
   desenvolvimento **mais novo que a última release publicada**, e carregam
   campos que a versão do Compose não conhece: `theme_uuid`, `folders`,
   `currency_code_column`, `datetime_format` e `configuration_method`. O
   validador do Superset **rejeita campo desconhecido em vez de ignorá-lo**, e
   o import falha com `Unknown field`. Todos são metadados de apresentação;
   removê-los não afeta dados, queries nem charts.

Os zips em `superset/exports/` **não são modificados** — seguem sendo o
artefato versionado e portável, e voltarão a importar sem adaptação quando a
versão do Compose alcançar a de origem.

### Import manual (fallback)

Se o `superset-init` registrar `AVISO: falha ao importar`, a stack sobe mesmo
assim e o import pode ser feito à mão:

1. Acesse o Superset → **Dashboards**
2. Clique em **Import Dashboard** (ícone de seta para cima, canto superior direito)
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
(`GET /api/v1/dashboard/export/`) na instância antiga da VM `192.168.56.128` e
podem ser reimportados em qualquer instância Superset com o driver
`clickhouse-connect` disponível — sujeito à adaptação descrita acima quando a
versão de destino for mais antiga que a de origem.

> **Nota sobre o layout.** O `position` dos dois bundles declara **20
> componentes CHART para 10 charts reais**: cada chart aparece duas vezes, e as
> 10 cópias extras não têm `uuid`, apenas `sliceName`. Isso faz o dashboard
> renderizar uma faixa duplicada no rodapé e exibir "There is no chart
> definition associated with this component" em um dos containers. O defeito
> **vem do export original**, não da importação — para corrigir de vez, arrume
> o layout no Superset e gere novos zips.
