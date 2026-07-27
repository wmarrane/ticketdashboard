# Design — Migração da stack para Docker Desktop (local)

**Data:** 2026-07-26
**Repositório:** https://github.com/wmarrane/ticketdashboard

> ## Correção pós-implementação (2026-07-27)
>
> **A decisão de fixar `apache/superset:4.1.4` estava errada e foi revertida
> para `5.0.0`.** O raciocínio original — "o layout `/app/.venv/bin/python`
> documentado no `superset/README.md` corresponde ao ramo 4.1.x" — inverteu a
> evidência: verificado na prática, o `4.1.4` **não tem venv algum** (Python do
> sistema, sem `/app/.venv`), enquanto o `5.0.0` tem exatamente o venv
> gerenciado por `uv` que o README descrevia.
>
> Mais importante, o problema real do import não era a senha. Os zips de
> `superset/exports/` vieram de um build **mais novo que qualquer release
> publicada** e carregam campos que versões anteriores desconhecem
> (`theme_uuid`, `folders`, `currency_code_column`, `datetime_format`,
> `configuration_method`). O validador do Superset **rejeita campo desconhecido
> em vez de ignorá-lo**, então o import falhava com `Unknown field` tanto no
> 4.1.4 quanto no 5.0.0.
>
> A solução implementada é independente de versão: `superset/patch_export.py`
> gera uma cópia temporária do bundle sem esses campos de apresentação e com a
> `sqlalchemy_uri` corrigida. Os zips versionados seguem intactos. Isso torna
> obsoleta a seção "Superset" abaixo no que diz respeito à tag e à ordem
> `import → set_database_uri` (a URI agora é corrigida **dentro** do bundle,
> antes do import; o `set_database_uri` permanece apenas como rede de
> segurança para o caminho manual).
>
> Também descoberto na migração dos dados: as tabelas da VM haviam derivado do
> `setup.sql` via `ALTER TABLE ADD COLUMN`, então `silver_tickets` e
> `ticket_overrides` tinham as mesmas colunas em **ordem diferente**. A cópia
> passou a ser feita por nome de coluna, não com `SELECT *`.

## Objetivo

Migrar a aplicação inteira — app, ClickHouse e Superset — das três VMs VirtualBox (`192.168.56.127`, `.128`, `.132`) para um único stack Docker Compose rodando no Docker Desktop da máquina Windows. As VMs são aposentadas; a stack local passa a ser o ambiente definitivo.

## Contexto levantado

**Licença.** Docker Desktop é gratuito para uso pessoal, educação, open source não-comercial e empresas com menos de 250 funcionários **e** menos de US$ 10M de receita anual; acima disso, uso comercial exige assinatura paga. O uso desta máquina foi confirmado como **pessoal / desenvolvimento próprio**, coberto pelo plano gratuito. (O Docker Engine é Apache-2.0 e livre em qualquer cenário — a restrição vale só para o Docker Desktop.)

**Ambiente local.** Docker Desktop 4.83.0, engine 29.6.2, 16 CPUs e ~16 GB no WSL2. Portas 80, 3001, 8088, 8123 e 9000 livres no host. A imagem `clickhouse/clickhouse-server:24.8` já está presente localmente (807 MB, zero download); `apache/superset` precisará ser baixado.

**Alcance das VMs durante a migração.** A VM `.127` (ClickHouse) responde em HTTP 8123 e tem a porta nativa 9000 aberta, tanto a partir do host quanto de dentro de um container. A VM `.128` (Superset) **não responde** — copiar seu metastore SQLite não é opção, e os dois zips versionados em `superset/exports/` são o caminho de restauração dos dashboards.

**Volume de dados a migrar** (medido na VM `.127`):

| tabela | linhas | tamanho |
|---|---|---|
| `bronze_tickets_raw` | 1.899 | 120 KiB |
| `silver_tickets` | 199 | 32 KiB |
| `title_translations` | 204 | 28 KiB |
| `load_history` | 41 | 5,6 KiB |
| `ticket_overrides` | 6 | 988 B |

Total abaixo de 200 KiB — a migração de dados não é um problema de escala.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Escopo | Stack completa local: app + ClickHouse + Superset |
| Convivência com as VMs | Nenhuma — migração definitiva, IPs saem da documentação |
| Arquivo Compose | Um único `docker-compose.yml` na raiz (sem variante `.local`) |
| Bootstrap | Automatizado: `docker compose up -d` deixa a stack utilizável |
| Driver ClickHouse no Superset | Embutido no build da imagem, não mais via `docker exec pip install` |
| Import dos dashboards | Automatizado via CLI, com falha **não-fatal** e fallback manual documentado |
| Migração de dados | `remote()` sobre a porta nativa 9000 da VM `.127` |

## Arquitetura

Um único `docker-compose.yml` na raiz, usando a rede bridge padrão do Compose (resolução por nome de serviço, como hoje).

| serviço | imagem / build | porta no host | volume |
|---|---|---|---|
| `clickhouse` | `clickhouse/clickhouse-server:24.8` | `127.0.0.1:8123` | `clickhouse_data` → `/var/lib/clickhouse` |
| `backend` | build `backend/Dockerfile` | — (apenas `expose 3001`) | — |
| `frontend` | build `frontend/Dockerfile` | `80` | — |
| `superset` | build `superset/Dockerfile` (`apache/superset:4.1.4`) | `8088` | `superset_home` → `/app/superset_home` |
| `superset-init` | mesma imagem do `superset`, one-shot | — | `superset_home` |
| `libretranslate` | `libretranslate/libretranslate` (profile `translate`) | — | `libretranslate_models` |

**ClickHouse publicado só em `127.0.0.1:8123`.** Precisa estar acessível no host para `npm run setup-db` e para o modo dev (`npm run dev` fora do container), mas não há razão para expô-lo na LAN. `frontend` (:80) e `superset` (:8088) ficam no bind padrão.

**A porta 3001 do backend continua interna**, como na VM: o Nginx do frontend segue fazendo proxy de `/api` para `backend:3001`, incluindo o *reresolve* via DNS do Docker. `frontend/nginx.conf` não muda.

**O `mem_limit: 1600m` do LibreTranslate é removido.** Aquele limite existia porque o serviço levava a VM de 4 GB a thrashing; aqui há ~16 GB disponíveis. O `profile: translate` permanece (subir sob demanda continua sendo o comportamento correto), agora com volume para os modelos de idioma, evitando redownload a cada `up`.

**Ordem de subida** via healthchecks e `depends_on`: `backend` espera o `clickhouse` ficar *healthy* (healthcheck em `/ping`), `frontend` espera o `backend`, `superset` espera o `superset-init` concluir com sucesso.

## Bootstrap

### Schema do ClickHouse

A imagem oficial cria usuário, senha e banco pelas envs nativas `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` / `CLICKHOUSE_DB`, lidas do `.env` da raiz — as mesmas variáveis que o backend já consome, sem introduzir nomes novos.

O `backend/sql/setup.sql` é montado read-only em `/docker-entrypoint-initdb.d/setup.sql`, de modo que as 5 tabelas e as 8 views nascem no primeiro boot sem passo manual.

Esse hook roda **apenas quando o volume está vazio**. Quando o `setup.sql` mudar depois (nova view, nova coluna), o caminho continua sendo `npm run setup-db`, que é idempotente. Os dois mecanismos coexistem com papéis distintos e documentados: o initdb faz o *bootstrap*, o `setup-db` faz a *reaplicação*.

### Superset

`superset/Dockerfile` parte de **`apache/superset:4.1.4`** e instala `clickhouse-connect` no venv em tempo de build. Isso elimina a etapa manual `docker exec -u root superset uv pip install …` que hoje precisa ser refeita a cada recriação do container.

A tag é fixada em `4.1.4`, e não em `5.0.0` (o release mais novo disponível), por causa do risco identificado no import dos dashboards: os zips de `superset/exports/` foram gerados pela instância da VM `.128`, cujo layout de venv (`/app/.venv/bin/python`, documentado no `superset/README.md`) corresponde ao ramo 4.1.x. Importar exports 4.x em um Superset 5.0 atravessa uma mudança de major, e o import é justamente a etapa mais frágil do bootstrap. `4.1.4` é a última correção do ramo mais próximo da origem dos exports. A subida para 5.x fica como trabalho posterior, separado desta migração.

O `SUPERSET_SECRET_KEY` e as credenciais do admin vêm do `.env` da raiz.

O serviço one-shot `superset-init` executa, nesta ordem:

1. `superset db upgrade`
2. `superset fab create-admin`
3. `superset init`
4. import dos dois zips de `superset/exports/`
5. `set_database_uri` apontando a conexão `ClickHouse Tickets` para `clickhousedb://<user>:<senha>@clickhouse:8123/tickets`

A ordem é deliberada: os zips carregam internamente o host antigo `192.168.56.127` e nenhuma senha, então registrar a URI **antes** do import seria sobrescrito por ele. Registrando **depois**, a conexão fica com o host correto e com senha.

Falha em qualquer etapa do import é tratada como não-fatal: o serviço registra uma mensagem clara apontando para o procedimento manual do `superset/README.md` e a stack continua utilizável.

## Migração dos dados

Com a porta nativa 9000 da VM `.127` aberta e alcançável de dentro de um container, a cópia é um `INSERT INTO tickets.<tabela> SELECT * FROM remote('192.168.56.127:9000', tickets.<tabela>, <user>, <senha>)` por tabela, executado dentro do container `clickhouse` — sem dump intermediário em arquivo.

As **cinco** tabelas são migradas. As views gold não, por serem derivadas do `silver_tickets`.

`silver_tickets` entra na lista mesmo sendo reconstruída a cada upload: sem ela, o dashboard nasce vazio até o próximo envio de planilha.

Um script versionado `scripts/migrate-from-vm.sh` executa as cinco cópias e, ao final, imprime as contagens lado a lado (VM × local) para conferência. É de uso único, mas permanece no repositório como registro do que foi feito.

**Pré-condição:** o script exige a VM `.127` no ar e só deve rodar depois que o schema local existir (primeiro `up` concluído).

## Mudanças no repositório

### Código e configuração

| arquivo | mudança |
|---|---|
| `docker-compose.yml` | reescrito: 5 serviços + `superset-init`, healthchecks, volumes nomeados |
| `superset/Dockerfile` | **novo** — `apache/superset:4.1.4` + `clickhouse-connect` |
| `scripts/migrate-from-vm.sh` | **novo** — cópia das 5 tabelas + conferência de contagens |
| `.env.example` (raiz) | `CLICKHOUSE_URL=http://clickhouse:8123`; entram `SUPERSET_SECRET_KEY` e credenciais do admin |
| `backend/.env.example` | `CLICKHOUSE_URL=http://localhost:8123` (modo dev, fora do Compose) |
| `backend/src/config.ts` | default do `CLICKHOUSE_URL` passa de `http://192.168.56.127:8123` para `http://localhost:8123` |
| `backend/tests/config.test.ts` | valor de exemplo do IP trocado (o teste passa a URL explicitamente, então não depende do default) |

O default vira `localhost` e não `clickhouse` porque, dentro do Compose, a variável **sempre** vem do `env_file`. O default só é exercido por quem roda `npm run dev` ou os testes fora do Docker — e para esses `localhost:8123` é o valor correto.

### Documentação

`README.md`, `docs/arquitetura.md`, `docs/instalacao.md`, `docs/operacao.md`, `docs/dicionario-de-dados.md` e `superset/README.md` substituem os três IPs pela stack local: diagrama de arquitetura, tabela "papel de cada servidor" → serviços do Compose, quickstart e troubleshooting.

As linhas de troubleshooting sobre firewall entre `132↔127` perdem sentido e são substituídas por falhas plausíveis no novo cenário (porta ocupada no host, volume corrompido, `superset-init` falhando).

No `superset/README.md`, o passo de instalar o driver via `docker exec` é removido — passa a ser responsabilidade do build.

**Fora de escopo:** `docs/superpowers/plans/` e `docs/superpowers/specs/` anteriores não são alterados. São registro histórico das decisões tomadas na época; reescrevê-los apagaria o histórico. Este documento entra ao lado deles.

### Efeito nos testes

Hoje `RUN_INTEGRATION=1 npm test` exige a VM `.127` no ar. Com o ClickHouse em `localhost:8123`, o teste de integração passa a rodar contra o container local — o projeto deixa de depender de VM para ser testado.

## Critérios de aceite

Cada item precisa ser **demonstrado em execução**, não afirmado:

1. A partir de volume limpo, `docker compose up -d` deixa os 4 serviços de pé e o `superset-init` sai com código 0
2. As 5 tabelas e as 8 views existem no ClickHouse local, criadas pelo hook de initdb
3. `scripts/migrate-from-vm.sh` roda sem erro e as contagens batem: 1.899 / 199 / 204 / 41 / 6
4. `http://localhost` renderiza o dashboard com os dados migrados; `http://localhost/api/dashboard` devolve JSON
5. `http://localhost:8088` autentica e os dois dashboards (PT e EN) renderizam com dados
6. Upload de uma planilha funciona ponta a ponta (bronze → silver → gold)
7. `RUN_INTEGRATION=1 npm test` (backend) passa contra o ClickHouse local, e `npm test` do frontend passa
8. `docker compose down && docker compose up -d` preserva dados e dashboards

## Riscos

| Risco | Mitigação |
|---|---|
| Import dos dashboards via CLI falha (casamento de conexão/senha) | Falha não-fatal; fallback manual já documentado em `superset/README.md` |
| VM `.127` indisponível na hora da migração | Migrar os dados **antes** de desligar a VM; o script é reexecutável |
| Tag do `apache/superset` incompatível com o driver ou com os exports | Pinada em `4.1.4`, o ramo de origem dos zips; o build valida o driver e o critério de aceite 5 valida os dashboards |
| Perda de dados ao remover volumes por engano | Volumes nomeados (não anônimos); `docker compose down` sem `-v` preserva |
