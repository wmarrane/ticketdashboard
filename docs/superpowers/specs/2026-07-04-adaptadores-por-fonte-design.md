# Design — Adaptadores por fonte com auto-detecção de layout

**Data:** 2026-07-04 · **Incremento sobre:** `2026-07-03-ticket-dashboard-design.md`

## Problema

As exportações reais das fontes têm esquemas diferentes do layout canônico (Cards Ituran):
- **Wrike export:** colunas `Nome, Status, Data de criação, Vencimento, 🛎️ Request Type Base, Módulo/Processo:, Responsável, 👔 Customer, ‼️ Priority, Prioridade, Responsável Cliente, ID` (ID como float `4384524386.0`)
- **Loop (Follow up):** `Comparação, Card, Tipo de Correção, Sistema, Issues, Solution, Bug/Melhoria, FixTeam, Aligned Date, ⌛Fix Date, Netsoft Card, Atualizações, Status` (status com emoji "✅ Concluído"; quase sem ID; datas em texto pt-BR sem ano)
- **Estoque daily:** `CARD´s, Problema Relatado, Prioridade, Time, Status, Previsão Correção, Owner, Detalhe` (prioridade numérica 0/1; IDs `-`; status próprio)

O parser atual rejeita tudo isso (cabeçalhos não mapeiam).

## Decisões (confirmadas com o usuário)

1. **Status:** normalizar para o vocabulário canônico do Wrike (Backlog, In Progress, Development Team, Pendente Terceiros, Waiting Customer, Validation, Completed, Cancelled, Stopped).
2. **IDs ausentes:** gerar ID sintético determinístico a partir do título normalizado (`loop-<hash8>`, `stk-<hash8>`), preservando dedupe entre reenvios.
3. **Área:** colunas da fonte têm precedência (Estoque daily → área fixa `Estoque`; Loop `Sistema` Billing→Financeiro, Estoque/WMS→Estoque; Wrike `Módulo/Processo:` como hint), fallback nas keywords atuais.

## Arquitetura

- `backend/src/pipeline/adapters/` — um módulo por layout: `canonico.ts` (atual), `wrikeExport.ts`, `loop.ts`, `estoqueDaily.ts`.
- **Auto-detecção:** `parseSpreadsheet(buffer)` examina o cabeçalho e escolhe o adaptador; layout não reconhecido → erro claro (400) listando os aceitos. O campo `source` da tela continua registrando a procedência na bronze.
- `ParsedRow` ganha `areaHint?: 'Financeiro' | 'Estoque' | ''`.
- Bronze: `ALTER TABLE tickets.bronze_tickets_raw ADD COLUMN IF NOT EXISTS area_hint String` (migração idempotente no setup.sql).
- Silver: `area = if(area_hint != '', area_hint, <multiIf de keywords atual>)`.

## Mapeamentos por adaptador

### Wrike export
ticket_id=`ID` (remover sufixo `.0`); status=já canônico; task_name=`Nome`; due_date=`Vencimento` (dd/mm/yyyy); priority_label=`Prioridade`; priority_level=`‼️ Priority`; responsible=`Responsável Cliente`; area_hint via `Módulo/Processo:` (contém estoque/wms → Estoque; cnab/billing/fiscal/fatura → Financeiro; senão vazio).

### Loop
ticket_id=`Netsoft Card` ou sintético `loop-<sha1(título) 8 hex>`; task_name=`Card — Issues`; status: remover emojis/espaços e mapear {concluído→Completed, em andamento/em análise→In Progress, pendente→Pendente Terceiros, aguardando→Waiting Customer, validação/uat→Validation, cancelado→Cancelled}; não mapeado → texto limpo; due_date=`⌛Fix Date` se parseável (texto pt-BR sem ano → null); responsible=`FixTeam`; area_hint via `Sistema` (billing/finance→Financeiro; estoque/wms/inventário→Estoque); summary=`Solution`/`Atualizações`.

### Estoque daily
ticket_id=`CARD´s` (≠ `-`) ou sintético `stk-<hash8>`; task_name=`Problema Relatado`; status: {concluido→Completed, em análise→In Progress, pendente→Pendente Terceiros}; priority_level: 0→P0, 1→P1, n→Pn; priority_label derivado: P0→Urgente!, P1→Alta, P2→Normal, ≥P3→Baixa; due_date=`Previsão Correção` se Date (texto → summary); responsible=`Owner`; provider=`Time`; area_hint fixa=`Estoque`.

## Critérios de aceite

1. Testes unitários por adaptador (fixtures reproduzindo os cabeçalhos reais) verdes.
2. Upload real das 3 planilhas de `personaladmin/importfiles/` via API em produção: linhas aceitas > 0 em todas, rejeições justificadas.
3. Dashboard reflete os dados combinados (silver = último lote de cada fonte; dedupe por ticket_id).
4. Docs atualizados (dicionário: area_hint; operação: layouts aceitos).
