# Migração da stack para Docker Desktop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar app, ClickHouse e Superset das três VMs VirtualBox para um único stack Docker Compose rodando no Docker Desktop local, preservando os dados existentes.

**Architecture:** Um `docker-compose.yml` na raiz com 5 serviços na rede bridge padrão. O ClickHouse cria o schema no primeiro boot via hook `/docker-entrypoint-initdb.d/`; o Superset ganha o driver `clickhouse-connect` embutido no build e um serviço one-shot que faz o bootstrap e importa os dashboards versionados. Os dados vêm da VM `.127` por `remote()` sobre a porta nativa 9000.

**Tech Stack:** Docker Compose, `clickhouse/clickhouse-server:24.8`, `apache/superset:4.1.4`, Node 20 (backend/frontend já existentes), Vitest.

**Spec:** [`docs/superpowers/specs/2026-07-26-migracao-docker-desktop-design.md`](../specs/2026-07-26-migracao-docker-desktop-design.md)

## Global Constraints

- Imagem do ClickHouse fixada em `clickhouse/clickhouse-server:24.8` (já presente localmente, zero download).
- Imagem do Superset fixada em `apache/superset:4.1.4`. **`latest` é proibido.** O ramo 4.1.x é o de origem dos zips em `superset/exports/`.
- ClickHouse publicado **apenas** em `127.0.0.1:8123` — nunca em `0.0.0.0`.
- A porta 3001 do backend permanece interna (`expose`), nunca publicada no host.
- `frontend/nginx.conf` **não é alterado** — o proxy para `backend:3001` e o reresolve por DNS continuam como estão.
- `docs/superpowers/plans/` e `docs/superpowers/specs/` anteriores não são alterados (registro histórico).
- Volumes são **nomeados**, nunca anônimos: `clickhouse_data`, `superset_home`, `libretranslate_models`.
- O `.env` da raiz contém segredos e é gitignored — **nunca** commitar. Só o `.env.example` vai para o repositório.
- A VM `192.168.56.127` precisa estar no ar até a Task 3 passar. Não desligar antes disso.
- Nenhum passo pode remover volumes de outros projetos. Usar sempre `docker compose` a partir da raiz deste repositório, nunca `docker volume prune`.

### Fatos já verificados (não re-investigar)

- Bind mount de arquivo dentro do OneDrive funciona no Docker Desktop desta máquina.
- O hook `/docker-entrypoint-initdb.d/setup.sql` cria corretamente **5 tabelas + 8 views**.
- A imagem do ClickHouse tem `wget` e `clickhouse-client`; **não tem `curl`**.
- `/ping` responde sem credenciais, mas fica disponível durante a fase temporária do entrypoint — por isso o healthcheck testa a **existência do schema**, não o `/ping`.
- Portas 80, 3001, 8088, 8123 e 9000 estão livres no host.
- A VM `.127` responde em HTTP 8123 e tem a nativa 9000 aberta, tanto do host quanto de dentro de um container.
- Contagens de origem: `bronze_tickets_raw` 1899, `silver_tickets` 199, `title_translations` 204, `load_history` 41, `ticket_overrides` 6.

---

### Task 1: ClickHouse local com schema automático

**Files:**
- Modify: `docker-compose.yml` (reescrita completa do serviço; os demais serviços entram na Task 2)
- Modify: `backend/src/config.ts:13`
- Modify: `backend/tests/config.test.ts:20-25`
- Modify: `.env.example`
- Modify: `backend/.env.example`
- Create: `.env` (local, **não commitado**)

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: serviço Compose `clickhouse` acessível como `http://clickhouse:8123` de dentro da rede e `http://localhost:8123` do host; variáveis `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DATABASE`, `CLICKHOUSE_URL`, `PORT`, `LIBRETRANSLATE_URL`, `SUPERSET_SECRET_KEY`, `SUPERSET_ADMIN_USER`, `SUPERSET_ADMIN_PASSWORD`, `SUPERSET_ADMIN_EMAIL` definidas no `.env` da raiz.

- [ ] **Step 1: Escrever o teste que falha**

Em `backend/tests/config.test.ts`, adicionar o assert do novo default ao caso já existente `usa defaults quando variáveis ausentes`:

```typescript
  it('usa defaults quando variáveis ausentes', () => {
    const cfg = loadConfig({});
    expect(cfg.clickhouse.url).toBe('http://localhost:8123');
    expect(cfg.clickhouse.database).toBe('tickets');
    expect(cfg.port).toBe(3001);
    expect(cfg.libretranslateUrl).toBe('');
  });
```

No primeiro caso do arquivo (`lê valores do ambiente com defaults`), trocar as duas ocorrências de `'http://192.168.56.127:8123'` por `'http://clickhouse:8123'` — é só o valor de exemplo passado explicitamente, mas deixá-lo apontando para uma VM aposentada confunde quem ler depois.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx vitest run tests/config.test.ts`
Expected: FAIL — `expected 'http://192.168.56.127:8123' to be 'http://localhost:8123'`

- [ ] **Step 3: Corrigir o default**

Em `backend/src/config.ts`, linha 13:

```typescript
      url: env.CLICKHOUSE_URL ?? 'http://localhost:8123',
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && npx vitest run tests/config.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Escrever o `docker-compose.yml`**

Substituir o conteúdo inteiro por:

```yaml
services:
  clickhouse:
    image: clickhouse/clickhouse-server:24.8
    environment:
      CLICKHOUSE_USER: ${CLICKHOUSE_USER}
      CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD}
      CLICKHOUSE_DB: ${CLICKHOUSE_DATABASE}
    ports:
      - "127.0.0.1:8123:8123"
    volumes:
      - clickhouse_data:/var/lib/clickhouse
      - ./backend/sql/setup.sql:/docker-entrypoint-initdb.d/setup.sql:ro
    healthcheck:
      # Testa o schema, não o /ping: o /ping já responde durante a fase
      # temporária do entrypoint, antes do initdb terminar.
      test: ["CMD-SHELL", "clickhouse-client --user \"$$CLICKHOUSE_USER\" --password \"$$CLICKHOUSE_PASSWORD\" --query \"EXISTS TABLE tickets.silver_tickets\" | grep -q 1"]
      interval: 5s
      timeout: 5s
      retries: 30
      start_period: 20s
    restart: unless-stopped

volumes:
  clickhouse_data:
```

- [ ] **Step 6: Atualizar os dois `.env.example`**

`.env.example` (raiz — consumido pelo Compose):

```bash
# ClickHouse (nome do serviço na rede do Compose)
CLICKHOUSE_URL=http://clickhouse:8123
CLICKHOUSE_USER=tickets
CLICKHOUSE_PASSWORD=troque-esta-senha
CLICKHOUSE_DATABASE=tickets
PORT=3001
# URL do LibreTranslate (opcional; vazio → tradução via glossário estático)
LIBRETRANSLATE_URL=

# Superset
SUPERSET_SECRET_KEY=troque-por-uma-chave-aleatoria-longa
SUPERSET_ADMIN_USER=admin
SUPERSET_ADMIN_PASSWORD=troque-esta-senha
SUPERSET_ADMIN_EMAIL=admin@example.com
```

`backend/.env.example` (modo dev, fora do Compose — troca só a primeira linha):

```bash
CLICKHOUSE_URL=http://localhost:8123
```

Não usar `default` como `CLICKHOUSE_USER`: a imagem já cria o usuário `default` e passá-lo em `CLICKHOUSE_USER` conflita.

- [ ] **Step 7: Criar o `.env` real da raiz e corrigir o `backend/.env`**

Copiar de `backend/.env` os valores reais de `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD` e `CLICKHOUSE_DATABASE`, com `CLICKHOUSE_URL=http://clickhouse:8123`, e preencher as quatro variáveis do Superset com valores próprios.

No `backend/.env` (arquivo local, gitignored, usado pelo modo dev), trocar a primeira linha para:

```bash
CLICKHOUSE_URL=http://localhost:8123
```

Sem isso, `npm run dev` e `npm run setup-db` continuariam falando com a VM e quebrariam assim que ela for desligada.

Gerar a `SUPERSET_SECRET_KEY`:

```bash
openssl rand -base64 42
```

Confirmar que o arquivo está ignorado antes de seguir:

```bash
git check-ignore -v .env
```
Expected: uma linha apontando para a regra `.env` do `.gitignore`. Se não imprimir nada, **parar** — o `.env` seria commitado.

- [ ] **Step 8: Subir o ClickHouse e verificar o schema**

```bash
docker compose up -d clickhouse
docker compose ps
```
Expected: `clickhouse` com status `Up (healthy)` em até ~40s.

```bash
set -a; . ./.env; set +a
docker compose exec -T clickhouse clickhouse-client \
  --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --query \
  "SELECT engine LIKE '%View%' ? 'view' : 'table' AS tipo, count() FROM system.tables WHERE database='tickets' GROUP BY tipo ORDER BY tipo FORMAT TSV"
```
Expected:
```
table	5
view	8
```

Se vier `table 0`, o initdb não rodou — o volume `clickhouse_data` já existia de uma tentativa anterior. Nesse caso: `docker compose down && docker volume rm tickets_clickhouse_data && docker compose up -d clickhouse`.

- [ ] **Step 9: Commit**

```bash
git add docker-compose.yml .env.example backend/.env.example backend/src/config.ts backend/tests/config.test.ts
git commit -m "feat: ClickHouse containerizado com schema criado no primeiro boot"
```

---

### Task 2: Backend, frontend e LibreTranslate no Compose

**Files:**
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: serviço `clickhouse` e o `.env` da Task 1.
- Produces: `http://localhost` (dashboard), `http://localhost/api/dashboard` (JSON); serviço `backend` alcançável como `backend:3001` na rede interna.

- [ ] **Step 1: Adicionar os três serviços ao `docker-compose.yml`**

Inserir antes do bloco `volumes:`:

```yaml
  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    env_file: .env
    environment:
      CLICKHOUSE_URL: http://clickhouse:8123
      LIBRETRANSLATE_URL: http://libretranslate:5000
    expose:
      - "3001"
    depends_on:
      clickhouse:
        condition: service_healthy
    restart: unless-stopped

  frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped

  # Não sobe por padrão. Suba sob demanda para traduzir um lote grande:
  #   docker compose --profile translate up -d libretranslate
  # Sem ele, o worker de tradução cai no glossário estático (a tradução já
  # feita permanece no cache persistente title_translations).
  libretranslate:
    image: libretranslate/libretranslate
    environment:
      LT_LOAD_ONLY: pt,en
    volumes:
      - libretranslate_models:/home/libretranslate/.local
    profiles:
      - translate
    restart: unless-stopped
```

E acrescentar o volume:

```yaml
volumes:
  clickhouse_data:
  libretranslate_models:
```

O `mem_limit: 1600m` do LibreTranslate **não** é reintroduzido: existia para proteger uma VM de 4 GB, e aqui há ~16 GB no WSL2.

- [ ] **Step 2: Validar a sintaxe do Compose antes de construir**

Run: `docker compose config --quiet`
Expected: sem saída e exit code 0.

- [ ] **Step 3: Subir e verificar**

```bash
docker compose up -d --build
docker compose ps
```
Expected: `clickhouse` (healthy), `backend` (Up), `frontend` (Up). `libretranslate` **não** aparece — está em profile.

- [ ] **Step 4: Verificar a API e o dashboard**

```bash
curl -s -o /dev/null -w "api: %{http_code}\n" http://localhost/api/dashboard
curl -s -o /dev/null -w "app: %{http_code}\n" http://localhost/
```
Expected: `api: 200` e `app: 200`.

O dashboard responde 200 mas vem **sem dados** — normal, a migração é a Task 3. Se der 502, o backend não subiu: `docker compose logs backend`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: backend, frontend e libretranslate no compose local"
```

---

### Task 3: Migração dos dados da VM

**Files:**
- Create: `scripts/migrate-from-vm.sh`

**Interfaces:**
- Consumes: serviço `clickhouse` healthy (Task 1) e a VM `192.168.56.127` no ar.
- Produces: as 5 tabelas populadas no ClickHouse local.

- [ ] **Step 1: Criar o script**

```bash
#!/usr/bin/env bash
# Copia as tabelas da VM 192.168.56.127 (ClickHouse aposentado) para o
# ClickHouse local do Compose. Uso único, mas reexecutável: cada tabela é
# truncada antes da cópia. Requer a VM no ar e o schema local já criado.
#
#   VM_PASSWORD='senha-da-vm' ./scripts/migrate-from-vm.sh
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; . ./.env; set +a

VM_HOST="${VM_HOST:-192.168.56.127}"
VM_PORT="${VM_PORT:-9000}"
VM_USER="${VM_USER:-wagner}"
VM_PASSWORD="${VM_PASSWORD:?defina VM_PASSWORD com a senha do ClickHouse da VM}"

# As views gold não são copiadas: são derivadas de silver_tickets.
# silver_tickets entra na lista porque, sem ela, o dashboard fica vazio
# até o próximo upload de planilha.
TABLES=(bronze_tickets_raw load_history silver_tickets title_translations ticket_overrides)

ch() {
  docker compose exec -T clickhouse clickhouse-client \
    --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" "$@"
}

remote_expr() {
  echo "remote('${VM_HOST}:${VM_PORT}', tickets.$1, '${VM_USER}', '${VM_PASSWORD}')"
}

for t in "${TABLES[@]}"; do
  echo "[migrate] copiando ${t} ..."
  ch --query "TRUNCATE TABLE IF EXISTS tickets.${t}"
  ch --query "INSERT INTO tickets.${t} SELECT * FROM $(remote_expr "$t")"
done

echo
printf '%-22s %8s %8s  %s\n' TABELA VM LOCAL RESULTADO
divergiu=0
for t in "${TABLES[@]}"; do
  na_vm=$(ch --query "SELECT count() FROM $(remote_expr "$t")")
  local_=$(ch --query "SELECT count() FROM tickets.${t}")
  if [ "$na_vm" = "$local_" ]; then
    printf '%-22s %8s %8s  OK\n' "$t" "$na_vm" "$local_"
  else
    printf '%-22s %8s %8s  DIVERGIU\n' "$t" "$na_vm" "$local_"
    divergiu=1
  fi
done

exit "$divergiu"
```

- [ ] **Step 2: Tornar executável e rodar**

```bash
chmod +x scripts/migrate-from-vm.sh
VM_PASSWORD='<senha do ClickHouse da VM>' ./scripts/migrate-from-vm.sh
```

Expected — todas as linhas `OK` e exit code 0:

```
TABELA                       VM    LOCAL  RESULTADO
bronze_tickets_raw         1899     1899  OK
load_history                 41       41  OK
silver_tickets              199      199  OK
title_translations          204      204  OK
ticket_overrides              6        6  OK
```

Os números da coluna VM podem ser maiores se houve upload após o levantamento; o que precisa bater é VM × LOCAL.

- [ ] **Step 3: Confirmar que o dashboard agora mostra dados**

```bash
curl -s http://localhost/api/dashboard | head -c 400
```
Expected: JSON com números diferentes de zero em `gold_big_numbers`. Se vier vazio, reiniciar o backend (`docker compose restart backend`) e repetir.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-from-vm.sh
git commit -m "feat: script de migracao dos dados da VM para o ClickHouse local"
```

---

### Task 4: Superset containerizado

**Files:**
- Create: `superset/Dockerfile`
- Create: `superset/init.sh`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: serviço `clickhouse` healthy e as variáveis `SUPERSET_*` do `.env`.
- Produces: `http://localhost:8088` autenticado, com a conexão `ClickHouse Tickets` e os dashboards PT/EN.

- [ ] **Step 1: Criar o `superset/Dockerfile`**

```dockerfile
FROM apache/superset:4.1.4

# O driver ClickHouse é instalado no build, e não por `docker exec` depois de
# subir: assim ele sobrevive a qualquer recriação do container.
USER root
RUN /app/.venv/bin/pip install --no-cache-dir clickhouse-connect
USER superset
```

- [ ] **Step 2: Construir a imagem e verificar o driver**

```bash
docker compose build superset
docker compose run --rm --entrypoint /app/.venv/bin/python superset -c "import clickhouse_connect; print(clickhouse_connect.__version__)"
```
Expected: um número de versão.

O download da imagem base leva alguns minutos (~2 GB). Se o build falhar em `/app/.venv/bin/pip: not found`, a imagem 4.1.4 não usa venv — trocar a linha `RUN` por `RUN pip install --no-cache-dir clickhouse-connect` e reconstruir.

- [ ] **Step 3: Criar o `superset/init.sh`**

```bash
#!/usr/bin/env bash
# Bootstrap one-shot do Superset: metastore, admin, dashboards e conexão.
# Roda como serviço `superset-init` do Compose, antes do `superset`.
set -euo pipefail

superset db upgrade

superset fab create-admin \
  --username "${SUPERSET_ADMIN_USER}" \
  --firstname Admin --lastname Superset \
  --email "${SUPERSET_ADMIN_EMAIL}" \
  --password "${SUPERSET_ADMIN_PASSWORD}" \
  || echo "[init] admin já existe, seguindo"

superset init

# Import é a etapa frágil: falha aqui é NÃO-FATAL e cai no procedimento
# manual documentado em superset/README.md.
for zip in /exports/dashboard_tickets_pt.zip /exports/dashboard_tickets_en.zip; do
  if superset import-dashboards -p "$zip" -u "${SUPERSET_ADMIN_USER}"; then
    echo "[init] importado: $zip"
  else
    echo "[init] AVISO: falha ao importar $zip — importe manualmente (superset/README.md)"
  fi
done

# Depois do import, nunca antes: os zips carregam dentro deles o host antigo
# 192.168.56.127 e nenhuma senha, e sobrescreveriam uma URI registrada antes.
superset set_database_uri \
  -d "ClickHouse Tickets" \
  -u "clickhousedb://${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}@clickhouse:8123/${CLICKHOUSE_DATABASE}" \
  || echo "[init] AVISO: não foi possível ajustar a URI da conexão"

echo "[init] concluído"
```

```bash
chmod +x superset/init.sh
```

- [ ] **Step 4: Adicionar os dois serviços ao `docker-compose.yml`**

Inserir antes do bloco `volumes:`:

```yaml
  superset-init:
    build:
      context: .
      dockerfile: superset/Dockerfile
    env_file: .env
    volumes:
      - superset_home:/app/superset_home
      - ./superset/exports:/exports:ro
      - ./superset/init.sh:/init.sh:ro
    entrypoint: ["/bin/bash", "/init.sh"]
    depends_on:
      clickhouse:
        condition: service_healthy

  superset:
    build:
      context: .
      dockerfile: superset/Dockerfile
    env_file: .env
    ports:
      - "8088:8088"
    volumes:
      - superset_home:/app/superset_home
    depends_on:
      superset-init:
        condition: service_completed_successfully
    restart: unless-stopped
```

E acrescentar o volume:

```yaml
volumes:
  clickhouse_data:
  libretranslate_models:
  superset_home:
```

- [ ] **Step 5: Subir e acompanhar o bootstrap**

```bash
docker compose config --quiet
docker compose up -d
docker compose logs -f superset-init
```
Expected: a última linha do log é `[init] concluído` e o container sai com código 0. Confirmar:

```bash
docker compose ps -a superset-init
```
Expected: `Exited (0)`.

- [ ] **Step 6: Verificar os dashboards no navegador**

Abrir `http://localhost:8088`, autenticar com `SUPERSET_ADMIN_USER` / `SUPERSET_ADMIN_PASSWORD` e abrir os dois dashboards ("Acompanhamento de Tickets (PT)" e "Ticket Tracking (EN)").

Expected: os charts renderizam **com dados** (a Task 3 já populou a gold).

Se os logs tiverem mostrado o `AVISO: falha ao importar`, seguir o procedimento manual de `superset/README.md` (Dashboards → Import Dashboard, um zip de cada vez, informando a senha da conexão). Isso é um resultado previsto, não um bug a depurar.

- [ ] **Step 7: Commit**

```bash
git add superset/Dockerfile superset/init.sh docker-compose.yml
git commit -m "feat: Superset containerizado com driver embutido e bootstrap automatico"
```

---

### Task 5: Documentação

**Files:**
- Modify: `README.md`
- Modify: `docs/arquitetura.md`
- Modify: `docs/instalacao.md`
- Modify: `docs/operacao.md`
- Modify: `docs/dicionario-de-dados.md`
- Modify: `superset/README.md`

**Interfaces:**
- Consumes: a stack funcional das Tasks 1–4.
- Produces: documentação sem referência às VMs.

- [ ] **Step 1: Levantar todas as ocorrências a tratar**

```bash
grep -rn "192\.168\.56" --include="*.md" . | grep -v "docs/superpowers/"
```

Isso lista exatamente o que precisa mudar. O filtro `grep -v` protege os specs e planos históricos, que **não** são editados.

- [ ] **Step 2: Reescrever os diagramas e tabelas de servidor**

Em `README.md` e `docs/arquitetura.md`, o diagrama de blocos por IP vira a stack local. Substituir o bloco de arquitetura por:

```
Fontes (exportação manual: Wrike, Loop, Office 365 → Excel/CSV)
        │ upload via navegador
        ▼
Docker Desktop (local) — docker compose
  • frontend: React (Vite) servido por Nginx — http://localhost
    - proxy /api → backend:3001
  • backend: Node/Express TypeScript (3001, interno à rede do Compose)
  • clickhouse: banco `tickets` — 127.0.0.1:8123
      bronze_tickets_raw → silver_tickets → gold_* (8 views)
  • superset: http://localhost:8088 (dashboards PT e EN, lendo a gold)
  • libretranslate: sob demanda (profile `translate`)
```

Em `docs/arquitetura.md`, a tabela "Papel de cada servidor" passa a "Papel de cada serviço", com uma linha por serviço do Compose. A seção "Fluxo de dados" e "Decisões de design" descrevem lógica, não topologia — só ajustar as menções a IP.

- [ ] **Step 3: Reescrever `docs/instalacao.md`**

- Tabela de pré-requisitos: as três linhas de servidor viram uma — "Máquina com Docker Desktop (licença gratuita cobre uso pessoal); Node.js 20+ e npm para o modo dev".
- Seção 1 (`.env`): passa a descrever o `.env` da **raiz** como o arquivo principal, incluindo as quatro variáveis `SUPERSET_*` e como gerar a `SUPERSET_SECRET_KEY` com `openssl rand -base64 42`.
- Seção 2 (schema): explicar os **dois** mecanismos e quando usar cada um — o hook de initdb faz o *bootstrap* no primeiro boot (volume vazio); `npm run setup-db` faz a *reaplicação* quando o `setup.sql` mudar depois.
- Seção 3 (deploy): vira `docker compose up -d --build` na raiz, com `http://localhost` e `http://localhost:8088` como verificação.
- Seção 4 (Superset): o passo de instalar o driver por `docker exec` sai — agora é build. Resta a nota de que o import é automático e o manual é fallback.
- Seção 5 (dev): `npm run dev` continua igual, agora contra `localhost:8123`.

- [ ] **Step 4: Reescrever a tabela de troubleshooting de `docs/instalacao.md`**

Remover as linhas sobre firewall entre `132↔127`, que perderam sentido. A tabela final:

| Sintoma | Causa provável | Ação |
|---|---|---|
| `clickhouse` nunca fica `healthy` | initdb falhou ou credenciais divergem | `docker compose logs clickhouse`; conferir `CLICKHOUSE_USER`/`PASSWORD` no `.env` |
| Tabelas ausentes após o `up` | volume `clickhouse_data` já existia, então o initdb não rodou | `docker compose down && docker volume rm tickets_clickhouse_data && docker compose up -d` |
| `up` falha com "port is already allocated" | porta 80 ou 8088 ocupada no host | Liberar a porta ou ajustar o mapeamento no `docker-compose.yml` |
| `/api/dashboard` retorna 502 | backend não subiu | `docker compose logs backend` |
| Dashboard vazio | silver sem dados | Fazer um upload, ou rodar `scripts/migrate-from-vm.sh` |
| `superset-init` sai com código diferente de 0 | falha no `db upgrade` ou nas credenciais de admin | `docker compose logs superset-init` |
| Dashboards ausentes no Superset | import automático falhou (não-fatal) | Importar manualmente conforme `superset/README.md` |
| Superset: "Could not load database driver" | imagem construída antes do Dockerfile | `docker compose build --no-cache superset && docker compose up -d` |
| Carga com `status = transform_error` | falha no rebuild da silver (bronze intacta) | Ver coluna `error` em `tickets.load_history`, corrigir e reenviar |
| Upload retorna "Fonte inválida" | fonte fora de wrike/loop/office365 ou arquivo não `.xlsx`/`.csv` | Corrigir a seleção/arquivo |

- [ ] **Step 5: Ajustar `superset/README.md`, `docs/operacao.md` e `docs/dicionario-de-dados.md`**

- `superset/README.md`: apagar a seção "Pré-requisito: driver ClickHouse" com o `docker exec … uv pip install` e substituir por uma nota de que o driver vem no build (`superset/Dockerfile`). A URI da conexão passa a `clickhousedb://<user>:<senha>@clickhouse:8123/tickets`. A seção de importação manual **permanece** — é o fallback oficial.
- `docs/operacao.md`: trocar as URLs por `http://localhost` e `http://localhost:8088`.
- `docs/dicionario-de-dados.md`: corrigir a menção incidental ao IP.

- [ ] **Step 6: Confirmar que não sobrou IP fora do histórico**

```bash
grep -rn "192\.168\.56" --include="*.md" . | grep -v "docs/superpowers/"
```
Expected: nenhuma linha, **exceto** as ocorrências dentro de `scripts/migrate-from-vm.sh` documentadas em prosa (o script legitimamente aponta para a VM de origem).

- [ ] **Step 7: Commit**

```bash
git add README.md docs/arquitetura.md docs/instalacao.md docs/operacao.md docs/dicionario-de-dados.md superset/README.md
git commit -m "docs: stack local no Docker Desktop substitui as tres VMs"
```

---

### Task 6: Verificação dos critérios de aceite

**Files:** nenhum arquivo novo; esta task é a validação dos 8 critérios do spec.

**Interfaces:**
- Consumes: tudo das Tasks 1–5.
- Produces: evidência de execução para cada critério.

Nenhum critério pode ser marcado sem a saída real do comando. Se algum falhar, corrigir antes de seguir.

- [ ] **Step 1: Critério 8 primeiro — persistência**

O ciclo de restart é o teste mais destrutivo, então roda antes de tudo, enquanto ainda há a VM como rede de segurança.

```bash
docker compose down
docker compose up -d
docker compose ps
```
Expected: todos os serviços de volta; `superset-init` `Exited (0)`.

```bash
set -a; . ./.env; set +a
docker compose exec -T clickhouse clickhouse-client \
  --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" \
  --query "SELECT count() FROM tickets.bronze_tickets_raw"
```
Expected: `1899` (dados sobreviveram). Abrir `http://localhost:8088` e confirmar que os dashboards continuam lá.

- [ ] **Step 2: Critérios 1, 2 e 4 — stack e schema**

```bash
docker compose ps
curl -s -o /dev/null -w "app: %{http_code}\n" http://localhost/
curl -s http://localhost/api/dashboard | head -c 300
```
Expected: 4 serviços rodando, `app: 200`, JSON com dados.

- [ ] **Step 3: Critério 6 — upload ponta a ponta**

Abrir `http://localhost`, ir à página de Upload e enviar uma planilha real de `personaladmin/importfiles/`, escolhendo a fonte correta.

Expected: a carga aparece no histórico com status `success` e o dashboard reflete os números novos.

```bash
docker compose exec -T clickhouse clickhouse-client \
  --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" \
  --query "SELECT status, count() FROM tickets.load_history GROUP BY status FORMAT TSV"
```
Expected: nenhum `transform_error` novo.

- [ ] **Step 4: Critério 7 — testes**

```bash
cd backend && CLICKHOUSE_URL=http://localhost:8123 RUN_INTEGRATION=1 npm test
cd ../frontend && npm test
```
Expected: backend com 28 unitários + 1 integração passando, frontend verde.

Este é o ganho colateral da migração: o teste de integração deixa de depender de VM.

- [ ] **Step 5: Commit final e desligamento das VMs**

Se algum ajuste foi necessário durante a verificação:

```bash
git add -A
git commit -m "fix: ajustes da verificacao end-to-end da stack local"
```

Só depois de os 8 critérios passarem, as VMs `192.168.56.127`, `.128` e `.132` podem ser desligadas. **Não apagar os discos** até rodar a stack local por alguns dias — o `scripts/migrate-from-vm.sh` é reexecutável e só serve enquanto a `.127` existir.

---

## Notas para quem executa

- **Ordem importa.** A Task 3 depende da VM `.127` no ar. Se ela for desligada antes, os dados históricos se perdem.
- **Nunca rodar `docker volume prune`.** Esta máquina hospeda outros projetos (`prosports-*`, `r2p-*`, `nsmonitor-*`) com volumes próprios.
- **`docker compose down` sem `-v` preserva os volumes.** Com `-v`, apaga os dados e os dashboards.
- **O nome do volume no host tem prefixo do projeto:** `tickets_clickhouse_data`, não `clickhouse_data`. Conferir com `docker volume ls | grep tickets`.
