# Arquitetura

## Visão geral

```
Fontes (exportação manual: Wrike, Loop, Office 365 → Excel/CSV)
        │ upload via navegador
        ▼
192.168.56.132 — Docker
  • frontend: React (Vite) servido por Nginx (porta 80)
    - proxy /api → backend:3001 (nginx.conf)
  • backend: Node/Express TypeScript (porta 3001)
    - POST /api/upload → parseia planilha (SheetJS), grava bronze,
      registra load_history, reconstrói silver (TRUNCATE + INSERT)
    - GET /api/dashboard → consulta as 6 views gold
    - GET /api/uploads → histórico de cargas
        ▼
192.168.56.127 — ClickHouse (HTTP 8123), banco `tickets`
  bronze_tickets_raw → silver_tickets → gold_* (6 views)
        ▲
192.168.56.128 — Superset :8088 (2 dashboards: PT e EN, lendo a gold)
```

## Papel de cada servidor

| Servidor | Papel |
|---|---|
| 192.168.56.127 | ClickHouse. Banco `tickets` com as 3 camadas: `bronze_tickets_raw` (append-only), `load_history`, `silver_tickets` e 6 views gold. Schema criado por `backend/sql/setup.sql` via `npm run setup-db`. |
| 192.168.56.128 | Apache Superset (Docker, imagem `apache/superset`) em http://192.168.56.128:8088. Conecta na gold via `clickhousedb://` (driver `clickhouse-connect` instalado no venv do container). Metastore interno é SQLite no container; os exports em `superset/exports/` são o backup versionado. |
| 192.168.56.132 | Docker Compose com dois serviços: `frontend` (Nginx :80, serve o build do React e faz proxy de `/api` para o backend) e `backend` (Node/Express :3001). App live em http://192.168.56.132. |

## Fluxo de dados (passo a passo)

1. **Exportação manual** — usuário exporta a planilha da fonte (Wrike, Loop ou Office 365) em `.xlsx`/`.csv`.
2. **Upload** — na página Upload do frontend, seleciona a fonte (`wrike` | `loop` | `office365`) e o arquivo. O Nginx encaminha `POST /api/upload` ao backend.
3. **Validação e parse** — backend valida fonte e extensão (`.xlsx`/`.csv`, limite 20 MB), parseia com SheetJS mapeando os cabeçalhos conhecidos, normaliza espaços/NBSP e datas (dd/mm/aaaa → ISO). Linhas sem `ticket_id` ou sem `status` são rejeitadas com motivo; linhas totalmente vazias são ignoradas.
4. **Bronze** — linhas aceitas são inseridas em `bronze_tickets_raw` (append-only, tudo como String) com metadados `load_id` (UUID), `source`, `file_name`, `loaded_at`, `row_number`. Nada é apagado da bronze.
5. **Histórico** — um registro é gravado em `load_history` com contagem de aceitas/rejeitadas e status `success`.
6. **Silver** — o backend executa `TRUNCATE TABLE silver_tickets` + `INSERT ... SELECT` sobre a bronze, considerando apenas **a última carga bem-sucedida de cada fonte**. Aplica: deduplicação por `ticket_id` (vale o `loaded_at` mais recente), tipagem de datas, de-para status→step (PT/EN), `is_open`, classificação de `area` por palavras-chave. Se a transformação falhar, a bronze permanece intacta e um registro adicional `transform_error` é gravado no `load_history`.
7. **Gold** — as 6 views (`gold_*`) são views SQL sobre a silver; refletem os dados automaticamente após cada rebuild.
8. **Visualização** — frontend (`GET /api/dashboard`) e Superset leem a gold.

## Decisões de design

| Decisão | Escolha |
|---|---|
| Visualização | Superset **e** frontend customizado |
| Ranking Top 5 | Coluna Priority (P0–P5), P0 primeiro; níveis vazios por último |
| Área Financeiro/Estoque | Classificação por palavras-chave no título (`config/area-rules.json`); Financeiro tem precedência sobre Estoque |
| Ingestão | 100% manual (exportação de planilhas das fontes) |
| Carga | Tela de upload no frontend |
| Stack | React (Vite) + Node/Express em TypeScript |
| Orquestração | Scripts SQL executados pelo backend a cada upload (sem MVs, sem Airflow) |
| Idiomas | Uma silver única com colunas `_pt`/`_en`; o idioma é resolvido na visualização, sem duplicar dados |

## Por que transformação orquestrada pelo backend (e não Materialized Views)?

- **Semântica de rebuild total**: a silver representa o *estado atual* (última carga de cada fonte, deduplicada entre fontes). MVs do ClickHouse são incrementais por inserção e não expressam bem "recalcule tudo a partir do último lote por fonte, vale o mais recente em conflito".
- **Regras dinâmicas fora do banco**: o de-para status→step e as palavras-chave de área vivem no código/`config/area-rules.json` (versionados). O SQL da silver é gerado em runtime (`backend/src/pipeline/silverSql.ts`), o que seria impraticável dentro de uma MV fixa.
- **Erro isolado e auditável**: falha na transformação não corrompe a bronze e fica registrada no `load_history` — o operador simplesmente reenvia o arquivo.
- **Simplicidade operacional**: o volume é pequeno (planilhas manuais), então `TRUNCATE + INSERT` a cada upload custa milissegundos e dispensa Airflow/cron/MVs.
