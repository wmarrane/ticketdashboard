# Design — Fonte Oracle (CASOS), status Melhoria e edição de prioridade

**Data:** 2026-07-05 · Incremento sobre as regras de negócio anteriores.

## Fonte Oracle / CASOS (novo adaptador + source 'oracle')

Planilha `__CASOS_*` — colunas: Tipo, Área do produto, Gravidade, Contato do caso, Número, Assunto, Status, Data de envio, Data da última mensagem.

Mapeamento (`backend/src/pipeline/adapters/oracleCasos.ts`, detecção por cabeçalho: 'gravidade' + 'número' + 'assunto'):
- ticket_id = `Número`; task_name = `Assunto`; responsible = `Contato do caso`.
- **priority por Gravidade:** contém 'C2' ou 'urgente' → label `Urgente!`, level `P0`; 'C3' → `Normal`/`P2`; 'C4' → `Baixa`/`P3`; senão defaults (Normal/P2).
- **status:** se `Tipo` = 'Request an Enhancement' → `Melhoria`; senão de-para do campo Status: Awaiting Customer Reply → `Waiting Customer`, In Progress → `In Progress`, Escalated → `Pendente Terceiros`; desconhecido → texto limpo.
- provider = `Oracle`; fix_owner = `Oracle`.
- areaHint vazio (classificação por keywords no título); dueDate null; taskNameEn vazio (tradução em background).

Adicionar `oracle` a VALID_SOURCES (silverSql) e SOURCES (app.ts) e à tela de upload.

## Novo status canônico 'Melhoria'

- Adicionar ao de-para de step: `Melhoria` → step_pt `Melhoria`, step_en `Improvement`.
- `is_open` = 1 (não é terminal). Adicionar a CANONICAL_STATUSES do Excel.

## Edição de prioridade (frontend + persistência + reprocessamento)

- Tabela `ticket_overrides (ticket_id String, priority_label String, priority_level String, updated_at DateTime) ENGINE = ReplacingMergeTree(updated_at) ORDER BY ticket_id`.
- Rebuild da silver faz LEFT JOIN em ticket_overrides por ticket_id: `priority_label = if(ovr_label != '', ovr_label, <fonte>)`, idem level; `priority_label_en` deriva do label final.
- API `PUT /api/tickets/:id/priority` body `{ priority_label, priority_level }` — valida (label ∈ {Urgente!,Alta,Normal,Baixa}, level ∈ {P0..P5}); upsert em ticket_overrides; reconstrói a silver (buildSilverRefreshSql). Retorna 200.
- Frontend: nas tabelas Top 5, edição inline da prioridade (dois selects) por linha + botão salvar → chama a API → recarrega o dashboard.

## Top 5 com coluna fix_owner

- As views gold_top5_* já expõem fix_owner; TicketRow no frontend já tem fix_owner. Adicionar a coluna "Resp. Correção" / "Fix Owner" às tabelas Top 5.

## Aceite

1. Testes unitários do adaptador Oracle (todos os mapeamentos), silverSql (join overrides), API de edição. Suíte verde.
2. Upload real de `2026_07_04__CASOS_.xlsx` (source oracle) → aceitos > 0; prioridades e provider/fix_owner Oracle corretos; status Melhoria presente.
3. Editar a prioridade de um ticket no frontend → persiste e reflete no dashboard após reprocessar; sobrevive a novo upload.
4. Coluna fix_owner visível no Top 5.
