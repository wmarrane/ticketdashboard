# Guia de Instalação

## Pré-requisitos

| Item | Detalhe |
|---|---|
| Docker Desktop | Com Compose v2. O plano gratuito cobre uso pessoal, educação, open source não-comercial e empresas com menos de 250 funcionários **e** menos de US$ 10M de receita anual; acima disso, uso comercial exige assinatura paga. |
| Portas livres no host | `80` (frontend), `8088` (Superset), `8123` (ClickHouse, publicado só em `127.0.0.1`) |
| Node.js 20+ e npm | Apenas para o modo dev e para rodar os testes fora dos containers |

Toda a stack roda em containers. Não é necessário instalar ClickHouse, Superset nem Python na máquina.

## 1. Configurar o `.env`

O Compose lê o `.env` da **raiz do repositório**. Ele contém segredos e é gitignored — só o `.env.example` é versionado.

```bash
cp .env.example .env
```

| Variável | Padrão do exemplo | Descrição |
|---|---|---|
| `CLICKHOUSE_URL` | `http://clickhouse:8123` | URL do ClickHouse na rede do Compose |
| `CLICKHOUSE_USER` | `tickets` | Usuário — a imagem do ClickHouse o cria no primeiro boot |
| `CLICKHOUSE_PASSWORD` | *(placeholder)* | Senha — **não** commitar |
| `CLICKHOUSE_DATABASE` | `tickets` | Banco |
| `PORT` | `3001` | Porta do backend |
| `LIBRETRANSLATE_URL` | *(vazio)* | Vazio → tradução via glossário estático |
| `SUPERSET_SECRET_KEY` | *(placeholder)* | Chave de sessão do Superset |
| `SUPERSET_ADMIN_USER` | `admin` | Login do admin do Superset |
| `SUPERSET_ADMIN_PASSWORD` | *(placeholder)* | Senha do admin — **não** commitar |
| `SUPERSET_ADMIN_EMAIL` | `admin@example.com` | E-mail do admin |

Gere a chave do Superset com:

```bash
openssl rand -base64 42
```

> Não use `default` como `CLICKHOUSE_USER`: a imagem já cria esse usuário e passá-lo na variável conflita.

Para o **modo dev** (backend rodando fora do Compose), existe um `.env` separado em `backend/`, apontando para `http://localhost:8123`.

## 2. Subir a stack

```bash
docker compose up -d --build
```

Serviços:

- **clickhouse** — banco `tickets`, publicado apenas em `127.0.0.1:8123`, dados no volume `clickhouse_data`.
- **backend** — build de `backend/Dockerfile`, porta 3001 **interna à rede do Compose** (`expose`, não publicada).
- **frontend** — build de `frontend/Dockerfile` (React + Nginx), porta 80; o Nginx faz proxy de `/api/` para `backend:3001` (`frontend/nginx.conf`, `client_max_body_size 25m`).
- **superset-init** — one-shot: bootstrap do metastore, criação do admin e import dos dashboards.
- **superset** — Apache Superset 5.0.0, porta 8088, metastore no volume `superset_home`.
- **libretranslate** — não sobe por padrão; veja a seção 5.

Verificação: abrir **http://localhost** (dashboard), `http://localhost/api/dashboard` (JSON das views gold) e **http://localhost:8088** (Superset).

Atualização após mudanças no código ou em `config/area-rules.json`:

```bash
git pull && docker compose up -d --build
```

## 3. Schema do ClickHouse: os dois mecanismos

`backend/sql/setup.sql` cria o banco `tickets`, as tabelas `bronze_tickets_raw`, `load_history`, `silver_tickets`, `title_translations`, `ticket_overrides` e as 8 views gold. É idempotente (`IF NOT EXISTS` / `CREATE OR REPLACE VIEW`).

Ele é aplicado de duas formas, com papéis distintos:

| Mecanismo | Quando roda | Para quê |
|---|---|---|
| Hook `/docker-entrypoint-initdb.d/` | Automático, **só quando o volume `clickhouse_data` está vazio** | Bootstrap: a stack nasce com o schema pronto, sem passo manual |
| `npm run setup-db` | Manual, a partir do host | Reaplicação: quando o `setup.sql` mudar depois (nova view, nova coluna) |

```bash
cd backend && npm install && npm run setup-db
```

Saída esperada: uma linha `OK: ...` por statement e `Setup concluído.`

> O healthcheck do serviço `clickhouse` testa `EXISTS TABLE tickets.silver_tickets`, e não o `/ping`. O `/ping` já responde durante a fase temporária do entrypoint, antes de o initdb terminar — usá-lo liberaria o backend contra um banco ainda sem tabelas.

## 4. Superset

O `docker compose up -d` já deixa o Superset utilizável: o serviço `superset-init` cria o metastore, o admin e importa os dois dashboards de `superset/exports/`. O driver `clickhouse-connect` vem embutido no build (`superset/Dockerfile`) — não há mais o passo de instalar por `docker exec`.

Acesse **http://localhost:8088** com `SUPERSET_ADMIN_USER` / `SUPERSET_ADMIN_PASSWORD`.

Se o log do `superset-init` mostrar `AVISO: falha ao importar`, a stack sobe mesmo assim e o import pode ser feito à mão — o passo a passo está em [`superset/README.md`](../superset/README.md), que também explica por que os zips passam por uma adaptação automática antes do import.

> O metastore do Superset é SQLite no volume `superset_home` — os exports versionados em `superset/exports/` são o backup dos dashboards.

## 5. Tradução sob demanda (LibreTranslate)

O LibreTranslate fica atrás do profile `translate` e não sobe por padrão. Suba-o para traduzir um lote grande:

```bash
docker compose --profile translate up -d libretranslate
```

Sem ele, o worker de tradução cai no glossário estático, e a tradução já feita permanece no cache persistente `title_translations`. Os modelos de idioma ficam no volume `libretranslate_models`, evitando redownload a cada `up`.

## 6. Rodar em desenvolvimento (opcional)

```bash
# backend (porta 3001) — usa backend/.env, apontando para localhost:8123
cd backend && npm install && npm run dev

# frontend (Vite, proxy /api → localhost:3001)
cd frontend && npm install && npm run dev
```

Testes: `npm test` em `backend/` e `frontend/`; a integração roda com `RUN_INTEGRATION=1 npm test` e requer apenas o container `clickhouse` no ar.

## 7. Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| `clickhouse` nunca fica `healthy` | initdb falhou ou credenciais divergem | `docker compose logs clickhouse`; conferir `CLICKHOUSE_USER`/`CLICKHOUSE_PASSWORD` no `.env` |
| Tabelas ausentes após o `up` | o volume `clickhouse_data` já existia, então o initdb não rodou | `docker compose down && docker volume rm tickets_clickhouse_data && docker compose up -d` |
| `up` falha com "port is already allocated" | porta 80 ou 8088 ocupada no host | Liberar a porta ou ajustar o mapeamento no `docker-compose.yml` |
| `/api/dashboard` retorna 502 | backend não subiu | `docker compose logs backend` |
| Dashboard do frontend vazio | silver sem dados (nenhuma carga) | Fazer um upload na página Upload |
| `superset-init` sai com código diferente de 0 | falha no `db upgrade` ou nas credenciais de admin | `docker compose logs superset-init` |
| Dashboards ausentes no Superset | import automático falhou (não-fatal) | Importar manualmente conforme [`superset/README.md`](../superset/README.md) |
| Superset: "Could not load database driver: clickhousedb" | imagem construída antes do `superset/Dockerfile` | `docker compose build --no-cache superset && docker compose up -d` |
| Carga com `status = transform_error` no histórico | falha no rebuild da silver (bronze permanece intacta) | Ver coluna `error` em `tickets.load_history`, corrigir a causa e reenviar o arquivo |
| Upload retorna "Fonte inválida" / "Extensão não suportada" | fonte fora de wrike/loop/office365 ou arquivo que não é `.xlsx`/`.csv` | Corrigir a seleção/arquivo |

> **Cuidado com volumes.** `docker compose down` **sem** `-v` preserva os dados; com `-v`, apaga o banco e os dashboards. Nunca use `docker volume prune` se a máquina hospeda outros projetos. Os volumes deste projeto têm o prefixo `tickets_` (`docker volume ls | grep tickets`).
