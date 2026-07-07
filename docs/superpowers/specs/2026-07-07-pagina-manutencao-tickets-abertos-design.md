# Design — Página de manutenção de tickets abertos

**Data:** 2026-07-07 · Incremento sobre a edição de prioridade (ticket_overrides).

## Objetivo

Página dedicada listando TODOS os tickets abertos (is_open=1), com filtros multi-seleção por Status e por Prioridade, edição inline de **Status e Prioridade** por registro, e reprocessamento dos indicadores após cada atualização.

## Backend

### Override de status (estende ticket_overrides)
- `ALTER TABLE tickets.ticket_overrides ADD COLUMN IF NOT EXISTS status String;`
- Cada linha de override representa o estado completo desejado (status + priority_label + priority_level). Toda edição (Top 5 ou manutenção) envia os três valores atuais, com o(s) editado(s) alterado(s) — evita o problema de override parcial (argMax por updated_at pega a última linha completa).
- Rebuild da silver: aplica os overrides no SELECT mais interno, ANTES de derivar step/is_open/priority_label_en:
  - `status = if(ovr.status != '', ovr.status, bronze.status)`
  - `priority_label = if(ovr.priority_label != '', ovr.priority_label, bronze.priority_label)`
  - `priority_level = if(ovr.priority_level != '', ovr.priority_level, bronze.priority_level)`
  - step_pt/en (de-para) e is_open passam a refletir o status sobreposto; priority_label_en reflete o label sobreposto.

### API
- `PUT /api/tickets/:id` body `{ status, priority_label, priority_level }` — valida status ∈ conjunto canônico {Backlog, In Progress, Development Team, Pendente Terceiros, Waiting Customer, Validation, Melhoria, Completed, Stopped, Cancelled}, label ∈ {Urgente!,Alta,Normal,Baixa}, level ∈ {P0..P5}; upsert completo em ticket_overrides; reconstrói a silver (buildSilverRefreshSql). (Substitui PUT /api/tickets/:id/priority.)
- `GET /api/open-tickets` → JSON array de OpenTicketRow (view gold_open_tickets). Reusa fetchOpenTickets.

## Frontend

- Nova página `/manutencao` (link "Manutenção" no nav).
- Carrega os tickets abertos (GET /api/open-tickets).
- **Filtros multi-seleção:** Status (valores distintos presentes) e Prioridade (Urgente!/Alta/Normal/Baixa) — checkboxes; vazio = todos; combinados com E.
- **Barra de indicadores** no topo (recalculada sobre o resultado filtrado e recarregada após edição): total aberto, urgentes, por status resumido.
- **Tabela** com colunas: ID, Tarefa, Status, Prioridade (label+nível), Etapa, Responsável, Resp. Correção, Provedor, Vencimento, Área, + ação Editar.
- **Edição inline:** selects de Status (canônicos), rótulo e nível de prioridade; Salvar chama `updateTicket(id, {status, priority_label, priority_level})` → recarrega a lista (silver já reconstruída no backend) e os indicadores. Erro inline; desabilita durante o save.
- Top5Table passa a enviar também o status atual (inalterado) ao salvar prioridade, para manter o override completo.
- i18n PT/EN para rótulos novos (Manutenção/Maintenance, Filtros, Status, Todos/All, etc.), chaves idênticas nos dois dicionários.

## Aceite

1. Testes: override de status no silverSql (EXPLAIN válido no ClickHouse), updateTicket (validação + upsert + rebuild), rota open-tickets. Suíte verde.
2. Página lista todos os abertos, filtros multi funcionam, edição de status+prioridade persiste e reprocessa; indicadores atualizam.
3. Editar status para Completed remove o ticket dos abertos (is_open=0) após reprocessar.
