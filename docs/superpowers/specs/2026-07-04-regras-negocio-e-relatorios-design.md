# Design — Regras de negócio, fix_owner, traduções e relatórios HTML

**Data:** 2026-07-04 · **Incremento sobre:** adaptadores por fonte (2026-07-04)

## Regras de importação (aplicadas no parse/silver)

1. **wrike** → `provider = 'Netsoft'` e `fix_owner = 'Netsoft'`.
2. **Prioridade default:** `priority_label` vazio → `'Normal'` (sempre, inclusive quando level é P0/P1); `priority_level` vazio → `'P2'`. (Confirmado pelo usuário: "Normal/P2".)
3. **office365** com `provider = 'SISCORP'` → `step_pt = 'Em atendimento pelo SISCORP'`, `step_en = 'Handled by SISCORP'` (sobrepõe o de-para de status).
4. **loop** com FixTeam = `'Squad Finance'` → `provider = 'SISCORP'`.
5. **Nova coluna `fix_owner`** (responsável pela correção): Wrike export = `'Netsoft'` fixo · Loop = coluna `FixTeam` · Estoque daily = coluna `Time` · canônico = vazio.
6. **`priority_label_en`** derivado: Urgente!→Urgent!, Alta→High, Normal→Normal, Baixa→Low. Usado no dashboard EN, aba Excel EN e relatórios EN.
7. **Tradução automática** `task_name` → `task_name_en` no upload, quando `task_name_en` vier vazio, via glossário técnico local `config/glossario-pt-en.json` (substituição case-insensitive por termo, preservando o restante do texto). Glossário inicial com termos do domínio (fatura→invoice, pagamento→payment, remessa→shipment, estoque→inventory, nota fiscal→invoice (tax), boleto→bank slip, erro→error, integração→integration, etc.).

## Schema

- Bronze: `ADD COLUMN IF NOT EXISTS fix_owner String` (idempotente).
- Silver: colunas novas `fix_owner String`, `priority_label_en LowCardinality(String)`.
- Gold: `gold_priority_distribution` ganha `priority_label_en`; views top5 e a nova `gold_open_tickets` (todos os abertos com ID, tarefa PT/EN, prioridade label/label_en/level, step PT/EN, responsible, fix_owner, provider, vencimento, área).

## Relatórios HTML (arquivo autônomo, CSS embutido, sem JS externo)

- `GET /api/report/dashboard?lang=pt|en` → HTML com o mesmo conteúdo do painel (4 big numbers + 5 tabelas) no idioma pedido; `Content-Disposition: attachment; filename="AAAA_MM_DD_dashboard_{lang}.html"`.
- `GET /api/report/open-tickets?lang=pt|en` → tabela de todos os tickets abertos (colunas acima); filename `AAAA_MM_DD_tickets_abertos_{lang}.html` / `open_tickets`.
- Frontend: 2 botões novos ao lado de "Exportar Excel" (i18n): "Relatório HTML" e "Tickets Abertos (HTML)" — usam o idioma ativo.

## Interações e observações

- A regra 4 aplica-se sobre o valor de FixTeam (que abastece `fix_owner` no Loop).
- Regra 3 avaliada após regras 1/4 (provider já resolvido).
- Excel export: aba EN passa a usar `priority_label_en` na distribuição de prioridade; aba Cards ganha coluna extra "Responsável pela Correção" ao final? — NÃO: manter 16 colunas originais; `fix_owner` aparece nos relatórios HTML e na gold. (Se o usuário quiser no Excel, incremento futuro.)
- Reprocessamento: após deploy, reenviar as 3 planilhas reais para aplicar as regras ("atualizar a base").

## Aceite

1. Testes unitários das regras (cada uma) + glossário + relatórios (estrutura HTML) verdes.
2. Deploy + reupload das 3 planilhas; verificação: providers/fix_owner corretos por fonte, sem prioridade vazia, step SISCORP presente onde aplicável, task_name_en preenchido via glossário.
3. Download real dos 2 HTML (PT e EN) abrindo com dados corretos.
