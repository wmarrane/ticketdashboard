# Arquitetura

## Visão geral

```
Fontes (exportação manual: Wrike, Loop, Office 365 → Excel/CSV)
        │ upload via navegador
        ▼
Docker Desktop (local) — docker compose
  • frontend: React (Vite) servido por Nginx — http://localhost
    - proxy /api → backend:3001 (nginx.conf)
  • backend: Node/Express TypeScript (3001, interno à rede do Compose)
    - POST /api/upload → parseia planilha (SheetJS), grava bronze,
      reconstrói silver (TRUNCATE + INSERT) e só então registra
      load_history com status success
    - GET /api/dashboard → consulta as views gold
    - GET /api/uploads → histórico de cargas
        ▼
  • clickhouse: banco `tickets` — 127.0.0.1:8123
      bronze_tickets_raw → silver_tickets → gold_* (8 views)
        ▲
  • superset: http://localhost:8088 (2 dashboards: PT e EN, lendo a gold)
  • libretranslate: sob demanda (profile `translate`)
```

## Papel de cada serviço

| Serviço | Papel |
|---|---|
| `clickhouse` | Banco `tickets` com as 3 camadas: `bronze_tickets_raw` (append-only), `load_history`, `silver_tickets`, mais `title_translations` e `ticket_overrides`, e 8 views gold. O schema nasce no primeiro boot: `backend/sql/setup.sql` é montado em `/docker-entrypoint-initdb.d/`. Publicado **apenas** em `127.0.0.1:8123` — acessível ao host para `npm run dev` e `npm run setup-db`, invisível na LAN. Dados em volume nomeado `clickhouse_data`. |
| `backend` | Node/Express na porta 3001, **interna à rede do Compose** — não publicada no host. Só inicia depois que o `clickhouse` fica *healthy*. |
| `frontend` | Nginx na porta 80, serve o build do React e faz proxy de `/api` para `backend:3001`. App em http://localhost. |
| `superset` | Apache Superset 5.0.0 em http://localhost:8088. Conecta na gold via `clickhousedb://` — o driver `clickhouse-connect` é instalado no **build** (`superset/Dockerfile`), não por `docker exec`. Metastore SQLite no volume `superset_home`; os exports em `superset/exports/` são o backup versionado. |
| `superset-init` | One-shot que roda antes do `superset`: bootstrap do metastore, criação do admin e import dos dois dashboards. Falha no import é não-fatal e cai no procedimento manual de `superset/README.md`. |
| `libretranslate` | Tradução de títulos. Não sobe por padrão (profile `translate`); sem ele o worker cai no glossário estático e o cache `title_translations` permanece. |

## Healthchecks e ordem de subida

`docker compose up -d` sobe em ordem determinística, sem depender de retry:
`clickhouse` (healthy) → `backend` → `frontend`, e `superset-init` (concluído
com sucesso) → `superset`.

O healthcheck do ClickHouse testa **a existência do schema**
(`EXISTS TABLE tickets.silver_tickets`), e não o `/ping`. O `/ping` já responde
durante a fase temporária do entrypoint, antes de os scripts de initdb
terminarem — usá-lo liberaria o backend contra um banco ainda sem tabelas.

## Fluxo de dados (passo a passo)

1. **Exportação manual** — usuário exporta a planilha da fonte (Wrike, Loop ou Office 365) em `.xlsx`/`.csv`.
2. **Upload** — na página Upload do frontend, seleciona a fonte (`wrike` | `loop` | `office365`) e o arquivo. O Nginx encaminha `POST /api/upload` ao backend.
3. **Validação e parse** — backend valida fonte e extensão (`.xlsx`/`.csv`, limite 20 MB), parseia com SheetJS mapeando os cabeçalhos conhecidos, normaliza espaços/NBSP e datas (dd/mm/aaaa → ISO). Linhas sem `ticket_id` ou sem `status` são rejeitadas com motivo; linhas totalmente vazias são ignoradas.
4. **Bronze** — linhas aceitas são inseridas em `bronze_tickets_raw` (append-only, tudo como String) com metadados `load_id` (UUID), `source`, `file_name`, `loaded_at`, `row_number`. Nada é apagado da bronze.
5. **Silver** — o backend executa `TRUNCATE TABLE silver_tickets` + `INSERT ... SELECT` sobre a bronze, considerando a **última carga com `status = 'success'` das demais fontes** mais o **lote corrente** (incluído explicitamente via `UNION ALL`, pois ainda não tem registro no histórico). Aplica: deduplicação por `ticket_id` (vale o `loaded_at` mais recente), tipagem de datas, de-para status→step (PT/EN), `is_open`, classificação de `area` por palavras-chave. Planilhas sem nenhuma linha válida são recusadas com HTTP 400 antes de qualquer escrita.
6. **Histórico** — **somente após a transformação terminar sem erro**, um registro `success` é gravado em `load_history` com contagem de aceitas/rejeitadas. Se a transformação falhar, a bronze permanece intacta e apenas um registro `transform_error` é gravado — um lote falho nunca recebe `success` e, portanto, **nunca é selecionado em rebuilds futuros**.
7. **Gold** — as 8 views (`gold_*`) são views SQL sobre a silver; refletem os dados automaticamente após cada rebuild.
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
- **Erro isolado e auditável**: falha na transformação não corrompe a bronze e fica registrada no `load_history` como `transform_error` (sem registro `success`, o lote falho jamais é escolhido em rebuilds futuros) — o operador simplesmente reenvia o arquivo.
- **Simplicidade operacional**: o volume é pequeno (planilhas manuais), então `TRUNCATE + INSERT` a cada upload custa milissegundos e dispensa Airflow/cron/MVs.
