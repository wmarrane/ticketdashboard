# Dicionário de Dados

Banco: `tickets` (ClickHouse, 192.168.56.127:8123). Schema em `backend/sql/setup.sql`; transformação silver gerada por `backend/src/pipeline/silverSql.ts`.

## Bronze — `tickets.bronze_tickets_raw`

Append-only. Uma linha por linha aceita da planilha, sem transformação (tudo String). Nada é apagado. ENGINE MergeTree, ORDER BY `(load_id, row_number)`.

| Coluna | Tipo | Descrição / Origem |
|---|---|---|
| `load_id` | String | UUID gerado pelo backend a cada upload |
| `source` | LowCardinality(String) | Fonte informada no upload: `wrike` \| `loop` \| `office365` |
| `file_name` | String | Nome original do arquivo enviado |
| `loaded_at` | DateTime | Momento da carga (UTC, gerado pelo backend) |
| `row_number` | UInt32 | Posição sequencial da linha aceita dentro da carga (1..n) |
| `ticket_id` | String | Coluna da planilha "ID Netsoft / Oracle" |
| `status` | String | Coluna "Status" (status Wrike) |
| `task_name` | String | Coluna "Nome da Tarefa" |
| `task_name_en` | String | Coluna "Nome da Tarefa - ENG" |
| `due_date` | String | Coluna "Data de Vencimento", normalizada para `yyyy-mm-dd` (ou vazio) |
| `responsible` | String | Coluna "Responsável Cliente" |
| `priority_label` | String | Coluna "Prioridade" (Urgente!/Alta/Normal/Baixa) |
| `priority_level` | String | Coluna "Priority" (P0–P5), convertida para maiúsculas |
| `summary` | String | Coluna "Resumo" |
| `provider` | String | Coluna "Provedor" |

Valores das colunas de planilha são limpos no parser: NBSP (` `) vira espaço e as pontas são aparadas (`trim`).

## Histórico — `tickets.load_history`

Uma linha por evento de carga. ENGINE MergeTree, ORDER BY `loaded_at`.

| Coluna | Tipo | Descrição |
|---|---|---|
| `load_id` | String | UUID da carga (mesmo da bronze) |
| `source` | LowCardinality(String) | Fonte da carga |
| `file_name` | String | Nome do arquivo |
| `loaded_at` | DateTime | Momento da carga |
| `rows_accepted` | UInt32 | Linhas aceitas (inseridas na bronze) |
| `rows_rejected` | UInt32 | Linhas rejeitadas pelo parser (não inseridas) |
| `status` | LowCardinality(String) | `success` (gravado após inserir na bronze) ou `transform_error` (registro adicional gravado se o rebuild silver falhar) |
| `error` | String | Mensagem de erro quando `status = 'transform_error'`; vazio em sucesso |

A reconstrução da silver considera apenas a **última carga com `status = 'success'` de cada fonte** (`argMax(load_id, loaded_at)`).

## Silver — `tickets.silver_tickets`

Reconstruída a cada carga (`TRUNCATE` + `INSERT ... SELECT` da bronze). ENGINE MergeTree, ORDER BY `ticket_id`.

Escopo: linhas da última carga bem-sucedida de cada fonte, **deduplicadas por `ticket_id`** — em conflito entre fontes, vale a linha com `loaded_at` mais recente (`ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY loaded_at DESC) = 1`).

| Coluna | Tipo | Derivação |
|---|---|---|
| `ticket_id` | String | Bronze `ticket_id` (chave de deduplicação) |
| `source` | LowCardinality(String) | Bronze `source` |
| `status` | LowCardinality(String) | Bronze `status` (status Wrike) |
| `task_name` | String | Bronze `task_name` |
| `task_name_en` | String | Bronze `task_name_en` |
| `due_date` | Nullable(Date) | `toDateOrNull(due_date)` — datas inválidas/vazias viram NULL |
| `responsible` | String | Bronze `responsible` |
| `priority_label` | LowCardinality(String) | Bronze `priority_label` (Urgente!/Alta/Normal/Baixa) |
| `priority_level` | LowCardinality(String) | Bronze `priority_level` (P0–P5) |
| `provider` | String | Bronze `provider` |
| `step_pt` | String | De-para status→step (tabela abaixo); status fora da lista → vazio |
| `step_en` | String | Idem, rótulo em inglês |
| `is_open` | UInt8 | `1` se `status NOT IN ('Completed', 'Cancelled', 'Stopped')`, senão `0` |
| `area` | LowCardinality(String) | Classificação por palavras-chave no `task_name` (regras abaixo): `Financeiro` \| `Estoque` \| `Outros` |
| `loaded_at` | DateTime | Bronze `loaded_at` |

### De-para status → step (completo)

| Status Wrike | Step PT | Step EN |
|---|---|---|
| Backlog | Não Iniciado | Not Started |
| In Progress | Em análise pelo fornecedor | Under Vendor Analysis |
| Development Team | Correção pelo time de dev | Development by Vendor Dev Team |
| Pendente Terceiros | Chamado Oracle | Oracle Ticket |
| Waiting Customer | Aguardando retorno do Ituran | Waiting for Ituran's Response |
| Validation | UAT | UAT |
| Completed | Em produção | In Production |
| *(qualquer outro)* | *(vazio)* | *(vazio)* |

### Regras de área (`config/area-rules.json`)

Comparação por substring, sem distinção de maiúsculas/minúsculas, sobre o título da tarefa (`task_name`). **Financeiro é testado antes de Estoque**; sem correspondência → `Outros`.

| Área | Palavras-chave |
|---|---|
| Financeiro | fatura, pagamento, invoice, cnab, nfs-e, nfse, fiscal, cobrança, billing, contas a pagar, contas a receber, boleto, imposto, tax, remessa bancária |
| Estoque | estoque, inventário, inventory, item, remessa, warehouse, transferência, expedição, recebimento, wms |

O mesmo arquivo alimenta o classificador em TypeScript (testes) e o SQL da silver (`multiIf(match(lowerUTF8(task_name), ...))`). Para alterar as regras, edite o JSON e faça rebuild/redeploy do backend (veja `docs/operacao.md`).

## Definições oficiais

- **`is_open` (item aberto)** = `status ∉ {Completed, Cancelled, Stopped}`
- **Urgentes abertos** = `priority_label = 'Urgente!'` **e** `is_open = 1`
- **Concluídos** = `status = 'Completed'`

## Gold — 6 views sobre a silver

### `gold_big_numbers` (1 linha)

| Coluna | Tipo | Derivação |
|---|---|---|
| `total_tickets` | UInt64 | `count()` de todos os tickets da silver |
| `urgent_open` | UInt64 | `countIf(priority_label = 'Urgente!' AND is_open = 1)` |
| `open_items` | UInt64 | `countIf(is_open = 1)` |
| `completed` | UInt64 | `countIf(status = 'Completed')` |

### `gold_status_distribution` (1 linha por status, ordenada por qtd desc)

| Coluna | Tipo | Derivação |
|---|---|---|
| `status` | String | Status Wrike (chave do GROUP BY) |
| `step_pt` | String | Rótulo PT do status (`any(step_pt)`) |
| `step_en` | String | Rótulo EN do status (`any(step_en)`) |
| `qty` | UInt64 | `count()` por status |
| `pct` | Float64 | `qty / total de tickets`, arredondado a 4 casas (fração 0–1) |

### `gold_priority_distribution` (1 linha por prioridade, ordenada por qtd desc)

Exclui tickets com `priority_label` vazio (tanto da contagem quanto do denominador).

| Coluna | Tipo | Derivação |
|---|---|---|
| `priority_label` | String | Urgente! / Alta / Normal / Baixa |
| `qty` | UInt64 | `count()` por prioridade |
| `pct` | Float64 | `qty / tickets com prioridade preenchida`, 4 casas (fração 0–1) |

### `gold_priority_levels` (1 linha por nível, ordenada por nível asc)

Exclui tickets com `priority_level` vazio (contagem e denominador).

| Coluna | Tipo | Derivação |
|---|---|---|
| `priority_level` | String | P0–P5 |
| `qty` | UInt64 | `count()` por nível |
| `pct` | Float64 | `qty / tickets com nível preenchido`, 4 casas (fração 0–1) |

### `gold_top5_financeiro` e `gold_top5_estoque` (até 5 linhas cada)

Filtro: `area = 'Financeiro'` (ou `'Estoque'`) **e** `is_open = 1`. Ordenação: `priority_level` ascendente (P0 primeiro), níveis vazios por último. `LIMIT 5`.

| Coluna | Tipo | Derivação |
|---|---|---|
| `ticket_id` | String | ID do ticket |
| `task_name` | String | Título PT |
| `task_name_en` | String | Título EN |
| `priority_level` | String | P0–P5 |
| `priority_label` | String | Urgente!/Alta/Normal/Baixa |
| `status` | String | Status Wrike |
| `step_pt` | String | Step PT |
| `step_en` | String | Step EN |
| `responsible` | String | Responsável cliente |
| `due_date` | Nullable(Date) | Data de vencimento |
