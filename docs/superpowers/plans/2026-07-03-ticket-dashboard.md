# Ticket Dashboard (PT/EN) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboards PT/EN de acompanhamento de tickets com pipeline medallion (bronze/silver/gold) em ClickHouse, upload manual de planilhas, frontend React e dashboards Superset.

**Architecture:** Backend Node/Express recebe upload de Excel/CSV, grava dados brutos na bronze do ClickHouse e reconstrói a silver via SQL gerado (dedupe, de-para de status, classificação de área por palavras-chave). A gold é um conjunto de views sobre a silver, consumidas pelo frontend (via API) e pelo Superset.

**Tech Stack:** TypeScript, Node 20, Express 4, @clickhouse/client, xlsx (SheetJS), multer, Vitest, supertest, React 18 + Vite, react-router-dom, Nginx, Docker Compose. ClickHouse em 192.168.56.127, Superset em 192.168.56.128, containers em 192.168.56.132.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-03-ticket-dashboard-design.md`
- Banco ClickHouse: `tickets` em `192.168.56.127:8123` (HTTP), usuário/senha via `.env` — nunca hardcoded.
- Fontes válidas de upload: `wrike` | `loop` | `office365`.
- `is_open` = status ∉ {Completed, Cancelled, Stopped}.
- Urgentes abertos = `priority_label = 'Urgente!'` AND `is_open = 1`.
- De-para status→step (PT/EN) exatamente como na tabela do spec (Backlog→Não Iniciado/Not Started, In Progress→Em análise pelo fornecedor/Under Vendor Analysis, Development Team→Correção pelo time de dev/Development by Vendor Dev Team, Pendente Terceiros→Chamado Oracle/Oracle Ticket, Waiting Customer→Aguardando retorno do Ituran/Waiting for Ituran's Response, Validation→UAT/UAT, Completed→Em produção/In Production).
- Classificação de área: regras em `config/area-rules.json`; Financeiro avaliado antes de Estoque; sem match → `Outros`.
- Top 5: apenas tickets abertos da área, ordenados por `priority_level` (P0 primeiro; sem nível vai por último), limite 5.
- Colunas obrigatórias por linha: ticket_id e status — linhas sem elas são rejeitadas com motivo.
- Rótulos de UI sempre nos dois idiomas (dicionário i18n no frontend; colunas `_pt`/`_en` na gold).
- Commits frequentes, mensagens em português no padrão `tipo: descrição` (ex.: `feat: parser de planilhas`).
- Todos os caminhos abaixo são relativos à raiz do repo `C:\Users\Wagner\OneDrive\Pessoal\Documentos\Projetos\Tickets`.

---

### Task 1: Scaffold do backend + módulo de configuração

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/vitest.config.ts`, `backend/.env.example`, `backend/src/config.ts`
- Test: `backend/tests/config.test.ts`
- Modify: `.gitignore` (adicionar `backend/node_modules`, `backend/dist`, `.env`)
- Delete: `src/index.ts`, `tsconfig.json`, `package.json` da raiz (scaffold antigo; o repo passa a ter `backend/` e `frontend/`)

**Interfaces:**
- Produces: `config` object — `{ clickhouse: { url: string, username: string, password: string, database: string }, port: number }` exportado de `backend/src/config.ts`.

- [ ] **Step 1: Remover scaffold antigo e criar estrutura**

```powershell
git rm -r --cached src tsconfig.json package.json package-lock.json; Remove-Item -Recurse -Force src, tsconfig.json, package.json, package-lock.json, node_modules
```

- [ ] **Step 2: Criar `backend/package.json`**

```json
{
  "name": "ticketdashboard-backend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "setup-db": "tsx src/setupDb.ts"
  },
  "dependencies": {
    "@clickhouse/client": "^1.4.0",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "multer": "^1.4.5-lts.1",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/multer": "^1.4.11",
    "@types/node": "^20.14.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.3",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Criar `backend/tsconfig.json` e `backend/vitest.config.ts`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

```typescript
// backend/vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

- [ ] **Step 4: Criar `backend/.env.example`**

```
CLICKHOUSE_URL=http://192.168.56.127:8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=tickets
PORT=3001
```

- [ ] **Step 5: Escrever teste que falha para o config**

```typescript
// backend/tests/config.test.ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('lê valores do ambiente com defaults', () => {
    const cfg = loadConfig({
      CLICKHOUSE_URL: 'http://192.168.56.127:8123',
      CLICKHOUSE_USER: 'wagner',
      CLICKHOUSE_PASSWORD: 'x',
      CLICKHOUSE_DATABASE: 'tickets',
      PORT: '3001',
    });
    expect(cfg.clickhouse.url).toBe('http://192.168.56.127:8123');
    expect(cfg.clickhouse.username).toBe('wagner');
    expect(cfg.port).toBe(3001);
  });

  it('usa defaults quando variáveis ausentes', () => {
    const cfg = loadConfig({});
    expect(cfg.clickhouse.database).toBe('tickets');
    expect(cfg.port).toBe(3001);
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `cd backend; npm install; npx vitest run tests/config.test.ts`
Expected: FAIL — `Cannot find module '../src/config'`

- [ ] **Step 7: Implementar `backend/src/config.ts`**

```typescript
import 'dotenv/config';

export interface AppConfig {
  clickhouse: { url: string; username: string; password: string; database: string };
  port: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  return {
    clickhouse: {
      url: env.CLICKHOUSE_URL ?? 'http://192.168.56.127:8123',
      username: env.CLICKHOUSE_USER ?? 'default',
      password: env.CLICKHOUSE_PASSWORD ?? '',
      database: env.CLICKHOUSE_DATABASE ?? 'tickets',
    },
    port: Number(env.PORT ?? 3001),
  };
}

export const config = loadConfig();
```

- [ ] **Step 8: Rodar e ver passar**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 9: Commit**

```bash
git add backend .gitignore
git commit -m "feat: scaffold do backend com módulo de configuração"
```

---

### Task 2: Schema ClickHouse (bronze, silver, gold) + script de setup

**Files:**
- Create: `backend/sql/setup.sql`, `backend/src/setupDb.ts`, `backend/src/clickhouse.ts`

**Interfaces:**
- Consumes: `config` (Task 1).
- Produces: `getClient(): ClickHouseClient` de `backend/src/clickhouse.ts`; tabelas `tickets.bronze_tickets_raw`, `tickets.load_history`, `tickets.silver_tickets` e views `tickets.gold_big_numbers`, `tickets.gold_status_distribution`, `tickets.gold_priority_distribution`, `tickets.gold_priority_levels`, `tickets.gold_top5_financeiro`, `tickets.gold_top5_estoque`.

- [ ] **Step 1: Criar `backend/sql/setup.sql`**

```sql
CREATE DATABASE IF NOT EXISTS tickets;

CREATE TABLE IF NOT EXISTS tickets.bronze_tickets_raw (
  load_id String,
  source LowCardinality(String),
  file_name String,
  loaded_at DateTime,
  row_number UInt32,
  ticket_id String,
  status String,
  task_name String,
  task_name_en String,
  due_date String,
  responsible String,
  priority_label String,
  priority_level String,
  summary String,
  provider String
) ENGINE = MergeTree ORDER BY (load_id, row_number);

CREATE TABLE IF NOT EXISTS tickets.load_history (
  load_id String,
  source LowCardinality(String),
  file_name String,
  loaded_at DateTime,
  rows_accepted UInt32,
  rows_rejected UInt32,
  status LowCardinality(String),
  error String
) ENGINE = MergeTree ORDER BY loaded_at;

CREATE TABLE IF NOT EXISTS tickets.silver_tickets (
  ticket_id String,
  source LowCardinality(String),
  status LowCardinality(String),
  task_name String,
  task_name_en String,
  due_date Nullable(Date),
  responsible String,
  priority_label LowCardinality(String),
  priority_level LowCardinality(String),
  provider String,
  step_pt String,
  step_en String,
  is_open UInt8,
  area LowCardinality(String),
  loaded_at DateTime
) ENGINE = MergeTree ORDER BY ticket_id;

CREATE OR REPLACE VIEW tickets.gold_big_numbers AS
SELECT
  count() AS total_tickets,
  countIf(priority_label = 'Urgente!' AND is_open = 1) AS urgent_open,
  countIf(is_open = 1) AS open_items,
  countIf(status = 'Completed') AS completed
FROM tickets.silver_tickets;

CREATE OR REPLACE VIEW tickets.gold_status_distribution AS
SELECT
  status,
  any(step_pt) AS step_pt,
  any(step_en) AS step_en,
  count() AS qty,
  round(count() / (SELECT count() FROM tickets.silver_tickets), 4) AS pct
FROM tickets.silver_tickets
GROUP BY status
ORDER BY qty DESC;

CREATE OR REPLACE VIEW tickets.gold_priority_distribution AS
SELECT
  priority_label,
  count() AS qty,
  round(count() / (SELECT countIf(priority_label != '') FROM tickets.silver_tickets), 4) AS pct
FROM tickets.silver_tickets
WHERE priority_label != ''
GROUP BY priority_label
ORDER BY qty DESC;

CREATE OR REPLACE VIEW tickets.gold_priority_levels AS
SELECT
  priority_level,
  count() AS qty,
  round(count() / (SELECT countIf(priority_level != '') FROM tickets.silver_tickets), 4) AS pct
FROM tickets.silver_tickets
WHERE priority_level != ''
GROUP BY priority_level
ORDER BY priority_level ASC;

CREATE OR REPLACE VIEW tickets.gold_top5_financeiro AS
SELECT ticket_id, task_name, task_name_en, priority_level, priority_label,
       status, step_pt, step_en, responsible, due_date
FROM tickets.silver_tickets
WHERE area = 'Financeiro' AND is_open = 1
ORDER BY (priority_level = ''), priority_level ASC
LIMIT 5;

CREATE OR REPLACE VIEW tickets.gold_top5_estoque AS
SELECT ticket_id, task_name, task_name_en, priority_level, priority_label,
       status, step_pt, step_en, responsible, due_date
FROM tickets.silver_tickets
WHERE area = 'Estoque' AND is_open = 1
ORDER BY (priority_level = ''), priority_level ASC
LIMIT 5;
```

- [ ] **Step 2: Criar `backend/src/clickhouse.ts`**

```typescript
import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { config } from './config.js';

let client: ClickHouseClient | undefined;

export function getClient(): ClickHouseClient {
  if (!client) {
    client = createClient({
      url: config.clickhouse.url,
      username: config.clickhouse.username,
      password: config.clickhouse.password,
    });
  }
  return client;
}
```

- [ ] **Step 3: Criar `backend/src/setupDb.ts`**

```typescript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getClient } from './clickhouse.js';

const sqlPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'sql', 'setup.sql');
const statements = readFileSync(sqlPath, 'utf-8')
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const client = getClient();
for (const stmt of statements) {
  await client.command({ query: stmt });
  console.log('OK:', stmt.split('\n')[0]);
}
await client.close();
console.log('Setup concluído.');
```

- [ ] **Step 4: Executar contra o ClickHouse real e verificar**

Run: `cd backend; copy .env.example .env` (preencher usuário/senha do ClickHouse) e `npm run setup-db`
Expected: linhas `OK: CREATE ...` para cada statement, sem erro.

Run: `Invoke-RestMethod -Uri "http://192.168.56.127:8123/?query=SHOW%20TABLES%20FROM%20tickets" -Headers @{"X-ClickHouse-User"="<user>";"X-ClickHouse-Key"="<senha>"}`
Expected: lista contendo `bronze_tickets_raw`, `load_history`, `silver_tickets` e as 6 views `gold_*`.

- [ ] **Step 5: Commit**

```bash
git add backend/sql backend/src/clickhouse.ts backend/src/setupDb.ts
git commit -m "feat: schema ClickHouse bronze/silver/gold com script de setup"
```

---

### Task 3: Classificador de área por palavras-chave

**Files:**
- Create: `config/area-rules.json`, `backend/src/pipeline/areaClassifier.ts`
- Test: `backend/tests/areaClassifier.test.ts`

**Interfaces:**
- Produces: `classifyArea(taskName: string): 'Financeiro' | 'Estoque' | 'Outros'` e `areaRegexSql(): string` (expressão `multiIf(...)` para uso no SQL da silver) de `backend/src/pipeline/areaClassifier.ts`.

- [ ] **Step 1: Criar `config/area-rules.json`**

```json
{
  "Financeiro": ["fatura", "pagamento", "invoice", "cnab", "nfs-e", "nfse", "fiscal", "cobrança", "billing", "contas a pagar", "contas a receber", "boleto", "imposto", "tax", "remessa bancária"],
  "Estoque": ["estoque", "inventário", "inventory", "item", "remessa", "warehouse", "transferência", "expedição", "recebimento", "wms"]
}
```

- [ ] **Step 2: Escrever testes que falham**

```typescript
// backend/tests/areaClassifier.test.ts
import { describe, it, expect } from 'vitest';
import { classifyArea, areaRegexSql } from '../src/pipeline/areaClassifier';

describe('classifyArea', () => {
  it('classifica Financeiro por palavra-chave (case-insensitive)', () => {
    expect(classifyArea('BRL MR CNAB Delivery file processing')).toBe('Financeiro');
    expect(classifyArea('Erro na emissão de NFS-e')).toBe('Financeiro');
  });

  it('classifica Estoque', () => {
    expect(classifyArea('Erro criação remessa de terceiro 90')).toBe('Estoque');
    expect(classifyArea('Ajuste de inventário CD')).toBe('Estoque');
  });

  it('Financeiro tem precedência sobre Estoque', () => {
    expect(classifyArea('Remessa bancária de pagamento')).toBe('Financeiro');
  });

  it('sem match retorna Outros', () => {
    expect(classifyArea('GESTÃO | Ituran')).toBe('Outros');
  });
});

describe('areaRegexSql', () => {
  it('gera multiIf com Financeiro antes de Estoque', () => {
    const sql = areaRegexSql();
    expect(sql).toContain("'Financeiro'");
    expect(sql).toContain("'Estoque'");
    expect(sql).toContain("'Outros'");
    expect(sql.indexOf('Financeiro')).toBeLessThan(sql.indexOf('Estoque'));
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/areaClassifier.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 4: Implementar `backend/src/pipeline/areaClassifier.ts`**

```typescript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const rulesPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'config', 'area-rules.json');
const rules: Record<string, string[]> = JSON.parse(readFileSync(rulesPath, 'utf-8'));
const ORDER = ['Financeiro', 'Estoque'] as const;

export function classifyArea(taskName: string): 'Financeiro' | 'Estoque' | 'Outros' {
  const name = taskName.toLowerCase();
  for (const area of ORDER) {
    if (rules[area].some((kw) => name.includes(kw.toLowerCase()))) return area;
  }
  return 'Outros';
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function areaRegexSql(): string {
  const branches = ORDER.map((area) => {
    const pattern = rules[area].map((kw) => escapeRegex(kw.toLowerCase())).join('|');
    return `match(lowerUTF8(task_name), '(${pattern})'), '${area}'`;
  });
  return `multiIf(${branches.join(', ')}, 'Outros')`;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/areaClassifier.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 6: Commit**

```bash
git add config/area-rules.json backend/src/pipeline/areaClassifier.ts backend/tests/areaClassifier.test.ts
git commit -m "feat: classificador de área Financeiro/Estoque por palavras-chave"
```

---

### Task 4: Parser de planilhas (Excel/CSV)

**Files:**
- Create: `backend/src/pipeline/parser.ts`
- Test: `backend/tests/parser.test.ts`

**Interfaces:**
- Produces: de `backend/src/pipeline/parser.ts`:
  - `interface ParsedRow { ticketId: string; status: string; taskName: string; taskNameEn: string; dueDate: string | null; responsible: string; priorityLabel: string; priorityLevel: string; summary: string; provider: string }`
  - `interface ParseResult { rows: ParsedRow[]; rejected: { rowNumber: number; reason: string }[] }`
  - `parseSpreadsheet(buffer: Buffer): ParseResult`
- Cabeçalhos reconhecidos (planilha real): `ID Netsoft / Oracle`, `Status`, `Nome da Tarefa`, `Nome da Tarefa - ENG`, `Data de Vencimento`, `Responsável Cliente`, `Prioridade`, `Priority`, `Resumo`, `Provedor`.

- [ ] **Step 1: Escrever testes que falham**

```typescript
// backend/tests/parser.test.ts
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSpreadsheet } from '../src/pipeline/parser';

function buildXlsx(rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cards');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const HEADER = ['ID Netsoft / Oracle', 'Status', 'Nome da Tarefa', 'Data de Vencimento',
  'Responsável Cliente', 'Prioridade', 'Priority', 'Resumo', 'Provedor', 'Nome da Tarefa - ENG'];

describe('parseSpreadsheet', () => {
  it('parseia linha válida com tipagem', () => {
    const buf = buildXlsx([HEADER,
      ['6974258', 'Development Team', 'CNAB separado', new Date('2026-07-15'),
       'glauco@ituran.com.br', 'Alta', 'P2', 'resumo', 'Oracle', 'CNAB split']]);
    const { rows, rejected } = parseSpreadsheet(buf);
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      ticketId: '6974258', status: 'Development Team', taskName: 'CNAB separado',
      priorityLabel: 'Alta', priorityLevel: 'P2', provider: 'Oracle',
      dueDate: '2026-07-15',
    });
  });

  it('rejeita linha sem ticket_id e sem status, com motivo', () => {
    const buf = buildXlsx([HEADER,
      ['', 'Backlog', 'Sem ID', '', '', '', '', '', '', ''],
      ['123', '', 'Sem status', '', '', '', '', '', '', '']]);
    const { rows, rejected } = parseSpreadsheet(buf);
    expect(rows).toHaveLength(0);
    expect(rejected).toEqual([
      { rowNumber: 2, reason: 'ticket_id ausente' },
      { rowNumber: 3, reason: 'status ausente' },
    ]);
  });

  it('normaliza espaços não separáveis no ID', () => {
    const buf = buildXlsx([HEADER,
      ['6955434 ', 'Backlog', 'X', '', '', '', '', '', '', '']]);
    const { rows } = parseSpreadsheet(buf);
    expect(rows[0].ticketId).toBe('6955434');
  });

  it('linha totalmente vazia é ignorada silenciosamente', () => {
    const buf = buildXlsx([HEADER, ['', '', '', '', '', '', '', '', '', '']]);
    const { rows, rejected } = parseSpreadsheet(buf);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/parser.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `backend/src/pipeline/parser.ts`**

```typescript
import * as XLSX from 'xlsx';

export interface ParsedRow {
  ticketId: string; status: string; taskName: string; taskNameEn: string;
  dueDate: string | null; responsible: string; priorityLabel: string;
  priorityLevel: string; summary: string; provider: string;
}
export interface ParseResult {
  rows: ParsedRow[];
  rejected: { rowNumber: number; reason: string }[];
}

const COLUMNS: Record<string, keyof ParsedRow> = {
  'id netsoft / oracle': 'ticketId',
  'status': 'status',
  'nome da tarefa': 'taskName',
  'nome da tarefa - eng': 'taskNameEn',
  'data de vencimento': 'dueDate',
  'responsável cliente': 'responsible',
  'prioridade': 'priorityLabel',
  'priority': 'priorityLevel',
  'resumo': 'summary',
  'provedor': 'provider',
};

function clean(v: unknown): string {
  return String(v ?? '').replace(/ /g, ' ').trim();
}

function toIsoDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = clean(v);
  if (!s) return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^\d{4}-\d{2}-\d{2}/);
  return iso ? s.slice(0, 10) : null;
}

export function parseSpreadsheet(buffer: Buffer): ParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (raw.length === 0) return { rows: [], rejected: [] };

  const header = (raw[0] as unknown[]).map((h) => clean(h).toLowerCase());
  const rows: ParsedRow[] = [];
  const rejected: ParseResult['rejected'] = [];

  for (let i = 1; i < raw.length; i++) {
    const cells = raw[i] as unknown[];
    const rec: Partial<Record<keyof ParsedRow, unknown>> = {};
    header.forEach((h, c) => {
      const key = COLUMNS[h];
      if (key) rec[key] = cells[c];
    });
    const ticketId = clean(rec.ticketId);
    const status = clean(rec.status);
    const isEmpty = ticketId === '' && status === '' && clean(rec.taskName) === '';
    if (isEmpty) continue;
    if (!ticketId) { rejected.push({ rowNumber: i + 1, reason: 'ticket_id ausente' }); continue; }
    if (!status) { rejected.push({ rowNumber: i + 1, reason: 'status ausente' }); continue; }
    rows.push({
      ticketId, status,
      taskName: clean(rec.taskName),
      taskNameEn: clean(rec.taskNameEn),
      dueDate: toIsoDate(rec.dueDate),
      responsible: clean(rec.responsible),
      priorityLabel: clean(rec.priorityLabel),
      priorityLevel: clean(rec.priorityLevel).toUpperCase(),
      summary: clean(rec.summary),
      provider: clean(rec.provider),
    });
  }
  return { rows, rejected };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/parser.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add backend/src/pipeline/parser.ts backend/tests/parser.test.ts
git commit -m "feat: parser de planilhas Excel/CSV com validação de linhas"
```

---

### Task 5: Pipeline — carga bronze e reconstrução da silver

**Files:**
- Create: `backend/src/pipeline/loader.ts`, `backend/src/pipeline/silverSql.ts`
- Test: `backend/tests/silverSql.test.ts`, `backend/tests/pipeline.integration.test.ts`

**Interfaces:**
- Consumes: `ParsedRow`/`ParseResult` (Task 4), `getClient()` (Task 2), `areaRegexSql()` (Task 3).
- Produces:
  - `buildSilverSql(): string` de `silverSql.ts` — SQL completo do `INSERT INTO silver_tickets SELECT ... FROM bronze`.
  - `runLoad(source: string, fileName: string, parsed: ParseResult): Promise<{ loadId: string; rowsAccepted: number; rowsRejected: number }>` de `loader.ts` — insere bronze, registra `load_history`, reconstrói silver (TRUNCATE + INSERT).

- [ ] **Step 1: Teste unitário do SQL da silver (falhando)**

```typescript
// backend/tests/silverSql.test.ts
import { describe, it, expect } from 'vitest';
import { buildSilverSql } from '../src/pipeline/silverSql';

describe('buildSilverSql', () => {
  const sql = buildSilverSql();

  it('deduplica por ticket_id pegando a carga mais recente', () => {
    expect(sql).toContain('ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY loaded_at DESC)');
  });

  it('usa apenas o último lote de cada fonte', () => {
    expect(sql).toContain('argMax(load_id, loaded_at)');
  });

  it('mapeia status para step_pt e step_en', () => {
    expect(sql).toContain("'Development Team', 'Correção pelo time de dev'");
    expect(sql).toContain("'Development Team', 'Development by Vendor Dev Team'");
    expect(sql).toContain("'Waiting Customer', 'Aguardando retorno do Ituran'");
  });

  it('calcula is_open excluindo Completed/Cancelled/Stopped', () => {
    expect(sql).toContain("NOT IN ('Completed', 'Cancelled', 'Stopped')");
  });

  it('inclui classificação de área', () => {
    expect(sql).toContain("'Financeiro'");
    expect(sql).toContain("'Outros'");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/silverSql.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `backend/src/pipeline/silverSql.ts`**

```typescript
import { areaRegexSql } from './areaClassifier.js';

const STEP_PT = `transform(status,
  ['Backlog', 'In Progress', 'Development Team', 'Pendente Terceiros', 'Waiting Customer', 'Validation', 'Completed'],
  ['Não Iniciado', 'Em análise pelo fornecedor', 'Correção pelo time de dev', 'Chamado Oracle', 'Aguardando retorno do Ituran', 'UAT', 'Em produção'], '')`;

const STEP_EN = `transform(status,
  ['Backlog', 'In Progress', 'Development Team', 'Pendente Terceiros', 'Waiting Customer', 'Validation', 'Completed'],
  ['Not Started', 'Under Vendor Analysis', 'Development by Vendor Dev Team', 'Oracle Ticket', 'Waiting for Ituran''s Response', 'UAT', 'In Production'], '')`;

export function buildSilverSql(): string {
  return `
INSERT INTO tickets.silver_tickets
SELECT ticket_id, source, status, task_name, task_name_en,
       toDateOrNull(due_date) AS due_date,
       responsible, priority_label, priority_level, provider,
       ${STEP_PT} AS step_pt,
       ${STEP_EN} AS step_en,
       if(status NOT IN ('Completed', 'Cancelled', 'Stopped'), 1, 0) AS is_open,
       ${areaRegexSql()} AS area,
       loaded_at
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY loaded_at DESC) AS rn
  FROM tickets.bronze_tickets_raw
  WHERE (source, load_id) IN (
    SELECT source, argMax(load_id, loaded_at) FROM tickets.load_history
    WHERE status = 'success' GROUP BY source
  )
)
WHERE rn = 1`;
}
```

Nota sobre os mapeamentos: os comentários de step usam exatamente o de-para do spec. `transform` do ClickHouse cobre o mapeamento; status fora da lista ficam com step vazio.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/silverSql.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Implementar `backend/src/pipeline/loader.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { getClient } from '../clickhouse.js';
import type { ParseResult } from './parser.js';
import { buildSilverSql } from './silverSql.js';

export async function runLoad(source: string, fileName: string, parsed: ParseResult) {
  const client = getClient();
  const loadId = randomUUID();
  const loadedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

  await client.insert({
    table: 'tickets.bronze_tickets_raw',
    format: 'JSONEachRow',
    values: parsed.rows.map((r, i) => ({
      load_id: loadId, source, file_name: fileName, loaded_at: loadedAt,
      row_number: i + 1, ticket_id: r.ticketId, status: r.status,
      task_name: r.taskName, task_name_en: r.taskNameEn,
      due_date: r.dueDate ?? '', responsible: r.responsible,
      priority_label: r.priorityLabel, priority_level: r.priorityLevel,
      summary: r.summary, provider: r.provider,
    })),
  });

  await client.insert({
    table: 'tickets.load_history',
    format: 'JSONEachRow',
    values: [{
      load_id: loadId, source, file_name: fileName, loaded_at: loadedAt,
      rows_accepted: parsed.rows.length, rows_rejected: parsed.rejected.length,
      status: 'success', error: '',
    }],
  });

  try {
    await client.command({ query: 'TRUNCATE TABLE tickets.silver_tickets' });
    await client.command({ query: buildSilverSql() });
  } catch (err) {
    await client.insert({
      table: 'tickets.load_history',
      format: 'JSONEachRow',
      values: [{
        load_id: loadId, source, file_name: fileName, loaded_at: loadedAt,
        rows_accepted: parsed.rows.length, rows_rejected: parsed.rejected.length,
        status: 'transform_error', error: String(err),
      }],
    });
    throw err;
  }

  return { loadId, rowsAccepted: parsed.rows.length, rowsRejected: parsed.rejected.length };
}
```

- [ ] **Step 6: Teste de integração com a planilha de exemplo (roda só com ClickHouse acessível)**

```typescript
// backend/tests/pipeline.integration.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSpreadsheet } from '../src/pipeline/parser';
import { runLoad } from '../src/pipeline/loader';
import { getClient } from '../src/clickhouse';

const RUN = process.env.RUN_INTEGRATION === '1';

describe.skipIf(!RUN)('pipeline completo', () => {
  it('carrega planilha de exemplo até a gold', async () => {
    const buf = readFileSync('../personaladmin/2026_07_02_Cards_Ituran_Contrato_Squad.xlsx');
    const parsed = parseSpreadsheet(buf);
    expect(parsed.rows.length).toBeGreaterThan(50);

    const result = await runLoad('office365', 'exemplo.xlsx', parsed);
    expect(result.rowsAccepted).toBe(parsed.rows.length);

    const client = getClient();
    const rs = await client.query({
      query: 'SELECT * FROM tickets.gold_big_numbers', format: 'JSONEachRow',
    });
    const [big] = await rs.json<Record<string, number>>();
    expect(big.total_tickets).toBeGreaterThan(0);
    expect(big.open_items + big.completed).toBeLessThanOrEqual(big.total_tickets);
  }, 30000);
});
```

- [ ] **Step 7: Rodar integração contra o ClickHouse real**

Run: `$env:RUN_INTEGRATION='1'; npx vitest run tests/pipeline.integration.test.ts; Remove-Item Env:RUN_INTEGRATION`
Expected: PASS — planilha carregada, `gold_big_numbers` retorna contagens coerentes.

- [ ] **Step 8: Rodar suíte completa**

Run: `npm test`
Expected: PASS em todos os arquivos (integração é pulada sem a env var).

- [ ] **Step 9: Commit**

```bash
git add backend/src/pipeline backend/tests
git commit -m "feat: pipeline bronze->silver->gold com carga e reconstrução"
```

---

### Task 6: API Express (upload, dashboard, histórico)

**Files:**
- Create: `backend/src/app.ts`, `backend/src/server.ts`, `backend/src/routes/upload.ts`, `backend/src/routes/dashboard.ts`
- Test: `backend/tests/app.test.ts`

**Interfaces:**
- Consumes: `parseSpreadsheet` (Task 4), `runLoad` (Task 5), `getClient` (Task 2).
- Produces API HTTP:
  - `POST /api/upload` — multipart: campo `file` (.xlsx/.csv) e campo `source` (`wrike`|`loop`|`office365`). Resposta 200: `{ loadId, rowsAccepted, rowsRejected, rejected: [{rowNumber, reason}] }`. 400 se fonte inválida ou extensão não suportada.
  - `GET /api/dashboard` — `{ bigNumbers: {total_tickets, urgent_open, open_items, completed}, statusDistribution: [...], priorityDistribution: [...], priorityLevels: [...], top5Financeiro: [...], top5Estoque: [...] }` (linhas das views gold, mesmas colunas).
  - `GET /api/uploads` — últimas 50 linhas de `load_history` ordenadas por `loaded_at DESC`.
- Produces: `createApp(deps): Express` de `app.ts` com injeção `{ runLoad, queryGold }` para permitir teste sem ClickHouse.

- [ ] **Step 1: Escrever testes que falham (supertest com dependências fake)**

```typescript
// backend/tests/app.test.ts
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { createApp } from '../src/app';

function xlsxBuffer(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['ID Netsoft / Oracle', 'Status', 'Nome da Tarefa'],
    ['1', 'Backlog', 'Teste'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'S');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const fakeDeps = {
  runLoad: vi.fn().mockResolvedValue({ loadId: 'abc', rowsAccepted: 1, rowsRejected: 0 }),
  queryGold: vi.fn().mockResolvedValue({
    bigNumbers: { total_tickets: 97, urgent_open: 11, open_items: 41, completed: 43 },
    statusDistribution: [], priorityDistribution: [], priorityLevels: [],
    top5Financeiro: [], top5Estoque: [],
  }),
  listUploads: vi.fn().mockResolvedValue([]),
};

describe('API', () => {
  const app = createApp(fakeDeps);

  it('POST /api/upload aceita xlsx com fonte válida', async () => {
    const res = await request(app).post('/api/upload')
      .field('source', 'wrike')
      .attach('file', xlsxBuffer(), 'board.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.loadId).toBe('abc');
    expect(fakeDeps.runLoad).toHaveBeenCalledWith('wrike', 'board.xlsx', expect.anything());
  });

  it('POST /api/upload rejeita fonte inválida', async () => {
    const res = await request(app).post('/api/upload')
      .field('source', 'jira')
      .attach('file', xlsxBuffer(), 'board.xlsx');
    expect(res.status).toBe(400);
  });

  it('POST /api/upload rejeita extensão não suportada', async () => {
    const res = await request(app).post('/api/upload')
      .field('source', 'wrike')
      .attach('file', Buffer.from('x'), 'notas.txt');
    expect(res.status).toBe(400);
  });

  it('GET /api/dashboard retorna agregados da gold', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.bigNumbers.total_tickets).toBe(97);
  });

  it('GET /api/uploads retorna histórico', async () => {
    const res = await request(app).get('/api/uploads');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/app.test.ts`
Expected: FAIL — `createApp` inexistente.

- [ ] **Step 3: Implementar `backend/src/app.ts`**

```typescript
import express, { type Express } from 'express';
import multer from 'multer';
import { parseSpreadsheet, type ParseResult } from './pipeline/parser.js';

export interface Deps {
  runLoad: (source: string, fileName: string, parsed: ParseResult)
    => Promise<{ loadId: string; rowsAccepted: number; rowsRejected: number }>;
  queryGold: () => Promise<unknown>;
  listUploads: () => Promise<unknown[]>;
}

const SOURCES = new Set(['wrike', 'loop', 'office365']);
const EXTENSIONS = /\.(xlsx|csv)$/i;

export function createApp(deps: Deps): Express {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

  app.post('/api/upload', upload.single('file'), async (req, res) => {
    const source = String(req.body.source ?? '');
    if (!SOURCES.has(source)) return res.status(400).json({ error: 'Fonte inválida. Use wrike, loop ou office365.' });
    if (!req.file) return res.status(400).json({ error: 'Arquivo ausente.' });
    if (!EXTENSIONS.test(req.file.originalname)) return res.status(400).json({ error: 'Extensão não suportada. Use .xlsx ou .csv.' });
    try {
      const parsed = parseSpreadsheet(req.file.buffer);
      const result = await deps.runLoad(source, req.file.originalname, parsed);
      res.json({ ...result, rejected: parsed.rejected });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/dashboard', async (_req, res) => {
    try { res.json(await deps.queryGold()); }
    catch (err) { res.status(500).json({ error: String(err) }); }
  });

  app.get('/api/uploads', async (_req, res) => {
    try { res.json(await deps.listUploads()); }
    catch (err) { res.status(500).json({ error: String(err) }); }
  });

  return app;
}
```

- [ ] **Step 4: Implementar `backend/src/routes/dashboard.ts` (consultas gold reais)**

```typescript
import { getClient } from '../clickhouse.js';

async function rows(query: string): Promise<unknown[]> {
  const rs = await getClient().query({ query, format: 'JSONEachRow' });
  return rs.json();
}

export async function queryGold() {
  const [bigNumbers] = await rows('SELECT * FROM tickets.gold_big_numbers');
  return {
    bigNumbers,
    statusDistribution: await rows('SELECT * FROM tickets.gold_status_distribution'),
    priorityDistribution: await rows('SELECT * FROM tickets.gold_priority_distribution'),
    priorityLevels: await rows('SELECT * FROM tickets.gold_priority_levels'),
    top5Financeiro: await rows('SELECT * FROM tickets.gold_top5_financeiro'),
    top5Estoque: await rows('SELECT * FROM tickets.gold_top5_estoque'),
  };
}

export async function listUploads() {
  return rows('SELECT * FROM tickets.load_history ORDER BY loaded_at DESC LIMIT 50');
}
```

(`backend/src/routes/upload.ts` não é necessário como arquivo separado — a rota vive em `app.ts`; não criar arquivo vazio.)

- [ ] **Step 5: Implementar `backend/src/server.ts`**

```typescript
import { createApp } from './app.js';
import { config } from './config.js';
import { runLoad } from './pipeline/loader.js';
import { queryGold, listUploads } from './routes/dashboard.js';

const app = createApp({ runLoad, queryGold, listUploads });
app.listen(config.port, () => console.log(`Backend na porta ${config.port}`));
```

- [ ] **Step 6: Rodar testes e ver passar**

Run: `npx vitest run tests/app.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 7: Smoke test manual contra ClickHouse real**

Run: `npm run dev` e em outro terminal `Invoke-RestMethod http://localhost:3001/api/dashboard | ConvertTo-Json -Depth 4`
Expected: JSON com `bigNumbers` preenchido (dados da carga de integração da Task 5).

- [ ] **Step 8: Commit**

```bash
git add backend/src backend/tests/app.test.ts
git commit -m "feat: API de upload, dashboard e histórico de cargas"
```

---

### Task 7: Scaffold do frontend + i18n + cliente de API

**Files:**
- Create: `frontend/` (Vite React TS), `frontend/src/i18n.ts`, `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/vite.config.ts`
- Test: `frontend/src/i18n.test.ts`

**Interfaces:**
- Consumes: API HTTP da Task 6 (em dev, proxy `/api` → `http://localhost:3001`).
- Produces:
  - `t(lang: 'pt' | 'en', key: string): string` e objeto `messages` de `frontend/src/i18n.ts`.
  - `fetchDashboard(): Promise<DashboardData>`, `uploadFile(source: string, file: File): Promise<UploadResult>`, `fetchUploads(): Promise<UploadHistoryRow[]>` de `frontend/src/api.ts`.
  - Tipos: `DashboardData { bigNumbers: BigNumbers; statusDistribution: StatusRow[]; priorityDistribution: PriorityRow[]; priorityLevels: LevelRow[]; top5Financeiro: TicketRow[]; top5Estoque: TicketRow[] }`; `TicketRow { ticket_id, task_name, task_name_en, priority_level, priority_label, status, step_pt, step_en, responsible, due_date }`.

- [ ] **Step 1: Criar projeto Vite**

Run: `npm create vite@latest frontend -- --template react-ts; cd frontend; npm install; npm install react-router-dom`
Expected: scaffold criado, `npm run dev` sobe em http://localhost:5173.

- [ ] **Step 2: Configurar proxy em `frontend/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
  test: { environment: 'node' },
});
```

(Instalar vitest no frontend: `npm install -D vitest`; adicionar script `"test": "vitest run"`.)

- [ ] **Step 3: Teste do i18n (falhando)**

```typescript
// frontend/src/i18n.test.ts
import { describe, it, expect } from 'vitest';
import { t, messages } from './i18n';

describe('i18n', () => {
  it('traduz chaves nos dois idiomas', () => {
    expect(t('pt', 'title')).toBe('Painel de Acompanhamento de Tickets');
    expect(t('en', 'title')).toBe('Ticket Tracking Dashboard');
  });

  it('pt e en têm exatamente as mesmas chaves', () => {
    expect(Object.keys(messages.pt).sort()).toEqual(Object.keys(messages.en).sort());
  });

  it('chave desconhecida retorna a própria chave', () => {
    expect(t('pt', 'nao_existe')).toBe('nao_existe');
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `cd frontend; npx vitest run src/i18n.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 5: Implementar `frontend/src/i18n.ts`**

```typescript
export type Lang = 'pt' | 'en';

export const messages: Record<Lang, Record<string, string>> = {
  pt: {
    title: 'Painel de Acompanhamento de Tickets',
    subtitle: 'Status das demandas — NetSuite / Oracle',
    totalTickets: 'Total de Tickets',
    urgentOpen: 'Urgentes Abertos',
    openItems: 'Itens Abertos',
    completed: 'Concluídos',
    statusDistribution: 'Distribuição por Status',
    priorityDistribution: 'Distribuição por Prioridade',
    priorityLevels: 'Níveis de Prioridade (P0–P5)',
    top5Finance: 'Top 5 Financeiro',
    top5Inventory: 'Top 5 Estoque',
    status: 'Status', step: 'Etapa', qty: 'Qtd', pct: '%',
    priority: 'Prioridade', level: 'Nível',
    task: 'Tarefa', responsible: 'Responsável', dueDate: 'Vencimento', id: 'ID',
    upload: 'Upload de Planilhas', dashboard: 'Dashboard',
    source: 'Fonte', file: 'Arquivo', send: 'Enviar',
    accepted: 'Linhas aceitas', rejectedRows: 'Linhas rejeitadas',
    history: 'Histórico de cargas', loadedAt: 'Data da carga',
    reason: 'Motivo', row: 'Linha', noData: 'Sem dados — faça um upload.',
    uploadSuccess: 'Carga concluída', uploadError: 'Erro na carga',
  },
  en: {
    title: 'Ticket Tracking Dashboard',
    subtitle: 'NetSuite / Oracle demand status',
    totalTickets: 'Total Tickets',
    urgentOpen: 'Urgent Open',
    openItems: 'Open Items',
    completed: 'Completed',
    statusDistribution: 'Status Distribution',
    priorityDistribution: 'Priority Distribution',
    priorityLevels: 'Priority Levels (P0–P5)',
    top5Finance: 'Top 5 Finance',
    top5Inventory: 'Top 5 Inventory',
    status: 'Status', step: 'Step', qty: 'Qty', pct: '%',
    priority: 'Priority', level: 'Level',
    task: 'Task', responsible: 'Owner', dueDate: 'Due Date', id: 'ID',
    upload: 'Spreadsheet Upload', dashboard: 'Dashboard',
    source: 'Source', file: 'File', send: 'Send',
    accepted: 'Accepted rows', rejectedRows: 'Rejected rows',
    history: 'Load history', loadedAt: 'Loaded at',
    reason: 'Reason', row: 'Row', noData: 'No data — upload a spreadsheet.',
    uploadSuccess: 'Load completed', uploadError: 'Load failed',
  },
};

export function t(lang: Lang, key: string): string {
  return messages[lang][key] ?? key;
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/i18n.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 7: Implementar `frontend/src/api.ts`**

```typescript
export interface BigNumbers { total_tickets: number; urgent_open: number; open_items: number; completed: number }
export interface StatusRow { status: string; step_pt: string; step_en: string; qty: number; pct: number }
export interface PriorityRow { priority_label: string; qty: number; pct: number }
export interface LevelRow { priority_level: string; qty: number; pct: number }
export interface TicketRow {
  ticket_id: string; task_name: string; task_name_en: string;
  priority_level: string; priority_label: string; status: string;
  step_pt: string; step_en: string; responsible: string; due_date: string | null;
}
export interface DashboardData {
  bigNumbers: BigNumbers; statusDistribution: StatusRow[];
  priorityDistribution: PriorityRow[]; priorityLevels: LevelRow[];
  top5Financeiro: TicketRow[]; top5Estoque: TicketRow[];
}
export interface UploadResult {
  loadId: string; rowsAccepted: number; rowsRejected: number;
  rejected: { rowNumber: number; reason: string }[];
}
export interface UploadHistoryRow {
  load_id: string; source: string; file_name: string; loaded_at: string;
  rows_accepted: number; rows_rejected: number; status: string; error: string;
}

async function check<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? res.statusText);
  return res.json() as Promise<T>;
}

export const fetchDashboard = () => fetch('/api/dashboard').then((r) => check<DashboardData>(r));
export const fetchUploads = () => fetch('/api/uploads').then((r) => check<UploadHistoryRow[]>(r));

export function uploadFile(source: string, file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('source', source);
  form.append('file', file);
  return fetch('/api/upload', { method: 'POST', body: form }).then((r) => check<UploadResult>(r));
}
```

- [ ] **Step 8: Implementar `frontend/src/App.tsx` e `frontend/src/main.tsx` (rotas + toggle de idioma)**

```tsx
// frontend/src/App.tsx
import { useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import type { Lang } from './i18n';
import { t } from './i18n';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';

export default function App() {
  const [lang, setLang] = useState<Lang>('pt');
  return (
    <div className="app">
      <header>
        <h1>{t(lang, 'title')}</h1>
        <nav>
          <Link to="/">{t(lang, 'dashboard')}</Link>
          <Link to="/upload">{t(lang, 'upload')}</Link>
          <button onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}>
            {lang === 'pt' ? 'EN' : 'PT'}
          </button>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<DashboardPage lang={lang} />} />
        <Route path="/upload" element={<UploadPage lang={lang} />} />
      </Routes>
    </div>
  );
}
```

```tsx
// frontend/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

(As páginas `DashboardPage` e `UploadPage` são criadas nas Tasks 8 e 9 — para compilar agora, criar versões mínimas que retornam `<p>...</p>` e serão substituídas.)

- [ ] **Step 9: Verificar build**

Run: `npm run build`
Expected: build Vite sem erros de tipo.

- [ ] **Step 10: Commit**

```bash
git add frontend
git commit -m "feat: scaffold do frontend com i18n PT/EN e cliente de API"
```

---

### Task 8: Página Dashboard (big numbers + 5 tabelas)

**Files:**
- Create: `frontend/src/pages/DashboardPage.tsx`, `frontend/src/components/BigNumber.tsx`, `frontend/src/components/DataTable.tsx`, `frontend/src/index.css` (substituir conteúdo do scaffold)

**Interfaces:**
- Consumes: `fetchDashboard`, tipos de `api.ts` (Task 7), `t`/`Lang` (Task 7).
- Produces: `DashboardPage({ lang }: { lang: Lang })` — usado pelo `App.tsx` da Task 7.

- [ ] **Step 1: Implementar `frontend/src/components/BigNumber.tsx`**

```tsx
export default function BigNumber({ value, label }: { value: number; label: string }) {
  return (
    <div className="big-number">
      <span className="big-number-value">{value}</span>
      <span className="big-number-label">{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Implementar `frontend/src/components/DataTable.tsx`**

```tsx
interface Props {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

export default function DataTable({ title, headers, rows }: Props) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Implementar `frontend/src/pages/DashboardPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { fetchDashboard, type DashboardData, type TicketRow } from '../api';
import { t, type Lang } from '../i18n';
import BigNumber from '../components/BigNumber';
import DataTable from '../components/DataTable';

const pctFmt = (p: number) => `${(p * 100).toFixed(1)}%`;

function ticketRows(lang: Lang, tickets: TicketRow[]): (string | number)[][] {
  return tickets.map((tk) => [
    tk.ticket_id,
    lang === 'pt' ? tk.task_name : (tk.task_name_en || tk.task_name),
    tk.priority_level || tk.priority_label,
    lang === 'pt' ? tk.step_pt : tk.step_en,
    tk.responsible,
    tk.due_date ?? '',
  ]);
}

export default function DashboardPage({ lang }: { lang: Lang }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboard().then(setData).catch((e) => setError(String(e)));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>...</p>;
  if (data.bigNumbers.total_tickets === 0) return <p>{t(lang, 'noData')}</p>;

  const ticketHeaders = [t(lang, 'id'), t(lang, 'task'), t(lang, 'priority'),
    t(lang, 'step'), t(lang, 'responsible'), t(lang, 'dueDate')];

  return (
    <main>
      <div className="big-numbers">
        <BigNumber value={data.bigNumbers.total_tickets} label={t(lang, 'totalTickets')} />
        <BigNumber value={data.bigNumbers.urgent_open} label={t(lang, 'urgentOpen')} />
        <BigNumber value={data.bigNumbers.open_items} label={t(lang, 'openItems')} />
        <BigNumber value={data.bigNumbers.completed} label={t(lang, 'completed')} />
      </div>
      <div className="grid">
        <DataTable
          title={t(lang, 'statusDistribution')}
          headers={[t(lang, 'status'), t(lang, 'step'), t(lang, 'qty'), t(lang, 'pct')]}
          rows={data.statusDistribution.map((r) => [r.status, lang === 'pt' ? r.step_pt : r.step_en, r.qty, pctFmt(r.pct)])}
        />
        <DataTable
          title={t(lang, 'priorityDistribution')}
          headers={[t(lang, 'priority'), t(lang, 'qty'), t(lang, 'pct')]}
          rows={data.priorityDistribution.map((r) => [r.priority_label, r.qty, pctFmt(r.pct)])}
        />
        <DataTable
          title={t(lang, 'priorityLevels')}
          headers={[t(lang, 'level'), t(lang, 'qty'), t(lang, 'pct')]}
          rows={data.priorityLevels.map((r) => [r.priority_level, r.qty, pctFmt(r.pct)])}
        />
        <DataTable title={t(lang, 'top5Finance')} headers={ticketHeaders} rows={ticketRows(lang, data.top5Financeiro)} />
        <DataTable title={t(lang, 'top5Inventory')} headers={ticketHeaders} rows={ticketRows(lang, data.top5Estoque)} />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Substituir `frontend/src/index.css`**

```css
* { box-sizing: border-box; margin: 0; }
body { font-family: 'Segoe UI', sans-serif; background: #f4f6f8; color: #1a2733; }
.app { max-width: 1400px; margin: 0 auto; padding: 16px; }
header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
header h1 { font-size: 1.4rem; }
nav { display: flex; gap: 12px; align-items: center; }
nav a { color: #0b5fff; text-decoration: none; font-weight: 600; }
nav button { padding: 4px 12px; border: 1px solid #0b5fff; background: #fff; color: #0b5fff; border-radius: 4px; cursor: pointer; font-weight: 700; }
.big-numbers { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.big-number { background: #0b3d66; color: #fff; border-radius: 8px; padding: 16px; text-align: center; }
.big-number-value { display: block; font-size: 2.2rem; font-weight: 800; }
.big-number-label { font-size: 0.85rem; opacity: 0.9; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 12px; }
.card { background: #fff; border-radius: 8px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.card h2 { font-size: 1rem; margin-bottom: 8px; color: #0b3d66; text-transform: uppercase; }
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e3e8ee; }
th { background: #eef2f6; }
.error { color: #b00020; padding: 16px; }
form.upload { background: #fff; border-radius: 8px; padding: 16px; max-width: 480px; display: grid; gap: 12px; }
.result-ok { color: #0a7d33; }
```

- [ ] **Step 5: Verificação manual no navegador**

Run: backend `npm run dev` (porta 3001, com dados carregados na Task 5) + frontend `npm run dev` (5173). Abrir http://localhost:5173.
Expected: 4 big numbers preenchidos; 5 tabelas com dados; alternar PT↔EN troca títulos, cabeçalhos e colunas de step/tarefa.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat: página de dashboard com big numbers e tabelas PT/EN"
```

---

### Task 9: Página de Upload com histórico

**Files:**
- Create: `frontend/src/pages/UploadPage.tsx`

**Interfaces:**
- Consumes: `uploadFile`, `fetchUploads`, tipos (Task 7); `t`/`Lang` (Task 7).
- Produces: `UploadPage({ lang }: { lang: Lang })` — usado pelo `App.tsx`.

- [ ] **Step 1: Implementar `frontend/src/pages/UploadPage.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { uploadFile, fetchUploads, type UploadResult, type UploadHistoryRow } from '../api';
import { t, type Lang } from '../i18n';
import DataTable from '../components/DataTable';

export default function UploadPage({ lang }: { lang: Lang }) {
  const [source, setSource] = useState('wrike');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<UploadHistoryRow[]>([]);
  const [busy, setBusy] = useState(false);

  const loadHistory = () => fetchUploads().then(setHistory).catch(() => {});
  useEffect(() => { loadHistory(); }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setError(''); setResult(null);
    try {
      setResult(await uploadFile(source, file));
      loadHistory();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <form className="upload" onSubmit={onSubmit}>
        <h2>{t(lang, 'upload')}</h2>
        <label>
          {t(lang, 'source')}
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="wrike">Wrike</option>
            <option value="loop">Loop</option>
            <option value="office365">Office 365</option>
          </select>
        </label>
        <label>
          {t(lang, 'file')}
          <input type="file" accept=".xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button type="submit" disabled={!file || busy}>{t(lang, 'send')}</button>
        {error && <p className="error">{t(lang, 'uploadError')}: {error}</p>}
        {result && (
          <div>
            <p className="result-ok">{t(lang, 'uploadSuccess')} — {t(lang, 'accepted')}: {result.rowsAccepted}, {t(lang, 'rejectedRows')}: {result.rowsRejected}</p>
            {result.rejected.length > 0 && (
              <DataTable
                title={t(lang, 'rejectedRows')}
                headers={[t(lang, 'row'), t(lang, 'reason')]}
                rows={result.rejected.map((r) => [r.rowNumber, r.reason])}
              />
            )}
          </div>
        )}
      </form>
      <DataTable
        title={t(lang, 'history')}
        headers={[t(lang, 'loadedAt'), t(lang, 'source'), t(lang, 'file'), t(lang, 'accepted'), t(lang, 'rejectedRows'), t(lang, 'status')]}
        rows={history.map((h) => [h.loaded_at, h.source, h.file_name, h.rows_accepted, h.rows_rejected, h.status])}
      />
    </main>
  );
}
```

- [ ] **Step 2: Verificação manual no navegador**

Com backend e frontend em dev: abrir http://localhost:5173/upload, enviar a planilha `personaladmin/2026_07_02_Cards_Ituran_Contrato_Squad.xlsx` com fonte `office365`.
Expected: mensagem de sucesso com linhas aceitas/rejeitadas (rejeitadas listadas com motivo), histórico atualizado; voltar ao dashboard e ver números atualizados.

- [ ] **Step 3: Testar caminho de erro**

Enviar um `.txt` qualquer.
Expected: mensagem de erro "Extensão não suportada" exibida, sem quebra da página.

- [ ] **Step 4: Rodar suítes completas (backend e frontend)**

Run: `cd backend; npm test; cd ../frontend; npm test; npm run build`
Expected: todos PASS, build sem erros.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/UploadPage.tsx
git commit -m "feat: página de upload com resultado da carga e histórico"
```

---

### Task 10: Docker Compose e deploy no servidor 192.168.56.132

**Files:**
- Create: `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`, `docker-compose.yml`, `.env.example` (raiz)

**Interfaces:**
- Consumes: backend (Task 6) e frontend (Tasks 8–9) prontos.
- Produces: stack `docker compose up -d` com frontend na porta 80 (proxy `/api` → backend:3001) e backend na 3001.

- [ ] **Step 1: Criar `backend/Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY sql ./sql
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/sql ./sql
COPY config ./config
EXPOSE 3001
CMD ["node", "dist/server.js"]
```

Nota: o classificador lê `config/area-rules.json` via caminho relativo ao módulo (`../../../config`). No container, ajustar o build context do compose para a raiz do repo (ver Step 3) para copiar `config/` — o Dockerfile acima assume context raiz: usar `COPY backend/package*.json ./` etc. Versão final com context raiz:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
COPY backend/sql ./sql
RUN npm run build

FROM node:20-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/sql ./sql
COPY config /app/config
EXPOSE 3001
CMD ["node", "dist/server.js"]
```

(Usar somente a versão final. Com `WORKDIR /app/backend` e dist em `/app/backend/dist`, o caminho `../../../config` resolve para `/app/config` — correto.)

- [ ] **Step 2: Criar `frontend/nginx.conf` e `frontend/Dockerfile`**

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  location /api/ {
    proxy_pass http://backend:3001;
    client_max_body_size 25m;
  }

  location / {
    try_files $uri /index.html;
  }
}
```

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 3: Criar `docker-compose.yml` e `.env.example` na raiz**

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    env_file: .env
    ports:
      - "3001:3001"
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
```

```
# .env.example (raiz)
CLICKHOUSE_URL=http://192.168.56.127:8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=tickets
PORT=3001
```

- [ ] **Step 4: Testar build local**

Run: `docker compose build`
Expected: duas imagens construídas sem erro. (Se Docker não estiver disponível na máquina Windows, executar este step direto no servidor 132 após o deploy do Step 5.)

- [ ] **Step 5: Deploy no servidor 192.168.56.132**

```bash
ssh wagner@192.168.56.132 "git clone https://github.com/wmarrane/ticketdashboard.git || (cd ticketdashboard && git pull)"
ssh wagner@192.168.56.132 "cd ticketdashboard && cp .env.example .env && nano .env"  # preencher credenciais ClickHouse
ssh wagner@192.168.56.132 "cd ticketdashboard && docker compose up -d --build"
```

Expected: `docker compose ps` mostra os dois serviços `running`.

- [ ] **Step 6: Verificação ponta a ponta**

Abrir http://192.168.56.132 no navegador: dashboard carrega; fazer um upload em /upload; alternar PT/EN.
Expected: fluxo completo funcionando contra o ClickHouse 192.168.56.127.

- [ ] **Step 7: Commit**

```bash
git add backend/Dockerfile frontend/Dockerfile frontend/nginx.conf docker-compose.yml .env.example
git commit -m "feat: containers Docker e compose para deploy"
git push origin master
```

---

### Task 11: Dashboards Superset (PT e EN)

**Files:**
- Create: `superset/README.md`, `superset/exports/` (zips exportados do Superset)

**Interfaces:**
- Consumes: views gold no ClickHouse (Task 2) com dados (Task 5).
- Produces: dois dashboards no Superset 192.168.56.128 + export versionado.

- [ ] **Step 1: Instalar driver ClickHouse no Superset (no servidor 128)**

```bash
ssh wagner@192.168.56.128 "pip install clickhouse-connect"  # ou dentro do venv/container do Superset
# se Superset roda em Docker: docker exec -it superset pip install clickhouse-connect && docker restart superset
```

Expected: driver disponível; Superset reiniciado.

- [ ] **Step 2: Criar conexão de banco no Superset (UI)**

Em http://192.168.56.128:8088 → Settings → Database Connections → + Database → ClickHouse Connect:
URI: `clickhousedb://<user>:<senha>@192.168.56.127:8123/tickets`
Expected: "Connection looks good!".

- [ ] **Step 3: Criar datasets**

Adicionar cada view gold como dataset: `gold_big_numbers`, `gold_status_distribution`, `gold_priority_distribution`, `gold_priority_levels`, `gold_top5_financeiro`, `gold_top5_estoque`.

- [ ] **Step 4: Montar dashboard "Acompanhamento de Tickets (PT)"**

Charts (todos a partir dos datasets acima):
1. 4 Big Number charts de `gold_big_numbers`: Total de Tickets (`total_tickets`), Urgentes Abertos (`urgent_open`), Itens Abertos (`open_items`), Concluídos (`completed`).
2. Table "Distribuição por Status": colunas status, step_pt, qty, pct (formatar pct como %).
3. Table "Distribuição por Prioridade": priority_label, qty, pct.
4. Table "Níveis de Prioridade (P0–P5)": priority_level, qty, pct.
5. Table "Top 5 Financeiro": ticket_id, task_name, priority_level, step_pt, responsible, due_date.
6. Table "Top 5 Estoque": mesmas colunas.

Layout: linha 1 com os 4 big numbers; linha 2 com as tabelas de status/prioridade/top5 financeiro; linha 3 com níveis P0–P5 e top 5 estoque (espelha o layout do spec).

- [ ] **Step 5: Montar dashboard "Ticket Tracking (EN)"**

Duplicar o dashboard PT (Edit → Save As). Renomear títulos dos charts para inglês (Total Tickets, Urgent Open, Open Items, Completed, Status Distribution, Priority Distribution, Priority Levels, Top 5 Finance, Top 5 Inventory) e trocar colunas `step_pt`→`step_en`, `task_name`→`task_name_en` nas tabelas.

- [ ] **Step 6: Exportar e versionar**

UI: Dashboards → selecionar os 2 → Export. Salvar os arquivos em `superset/exports/`.

- [ ] **Step 7: Escrever `superset/README.md`**

Conteúdo mínimo: pré-requisito do driver (`clickhouse-connect`), URI de conexão (sem senha real), passo a passo de importação (Dashboards → Import), lista dos datasets esperados e nota de que os exports estão em `superset/exports/`.

- [ ] **Step 8: Commit**

```bash
git add superset
git commit -m "feat: dashboards Superset PT/EN exportados com guia de importação"
```

---

### Task 12: Documentação do projeto

**Files:**
- Create: `README.md` (raiz), `docs/arquitetura.md`, `docs/dicionario-de-dados.md`, `docs/operacao.md`, `docs/instalacao.md`

**Interfaces:**
- Consumes: tudo que foi construído (Tasks 1–11).

- [ ] **Step 1: Escrever `README.md` (raiz)**

Conteúdo: título do projeto, objetivo (1 parágrafo), diagrama da arquitetura (o ASCII do spec), stack, links para os docs em `docs/`, quickstart (setup-db → docker compose up → abrir http://192.168.56.132), como rodar testes.

- [ ] **Step 2: Escrever `docs/arquitetura.md`**

Conteúdo: diagrama detalhado; papel de cada servidor (127 ClickHouse, 128 Superset, 132 containers); fluxo de dados passo a passo (exportação manual → upload → bronze → silver → gold → visualização); decisões de design e trade-offs (tabela de decisões do spec); por que transformação orquestrada pelo backend em vez de MVs.

- [ ] **Step 3: Escrever `docs/dicionario-de-dados.md`**

Conteúdo: para cada tabela/view (bronze_tickets_raw, load_history, silver_tickets, 6 views gold): coluna, tipo, descrição, origem/derivação. Incluir o de-para status→step completo e as regras de área (referenciando `config/area-rules.json`). Definições oficiais: is_open, urgentes abertos, concluídos.

- [ ] **Step 4: Escrever `docs/operacao.md`**

Conteúdo: como exportar planilha do Wrike (board → Export → Excel); como exportar a tabela do Loop (copiar para Excel); onde obter a planilha Office 365; como fazer upload (print/descrição da tela); como interpretar linhas rejeitadas; como ajustar as regras de área (`config/area-rules.json` + rebuild/redeploy do backend); como reprocessar (reenviar o último arquivo de cada fonte).

- [ ] **Step 5: Escrever `docs/instalacao.md`**

Conteúdo: pré-requisitos por servidor; criação do `.env`; `npm run setup-db` para criar schema no ClickHouse; deploy com docker compose no 132; configuração do Superset (resumo apontando para `superset/README.md`); troubleshooting (ClickHouse inacessível, credenciais, porta ocupada).

- [ ] **Step 6: Revisão cruzada spec × entrega**

Reler `docs/superpowers/specs/2026-07-03-ticket-dashboard-design.md` e conferir item a item (big numbers, 5 tabelas, PT/EN, 3 camadas, upload, Superset, docs). Corrigir qualquer divergência encontrada.

- [ ] **Step 7: Commit e push**

```bash
git add README.md docs
git commit -m "docs: documentação completa do projeto"
git push origin master
```

---

## Self-Review (executado na escrita do plano)

- **Cobertura do spec:** big numbers (T2 views + T8), 5 tabelas (T2/T8), PT/EN (T7/T8/T11), bronze/silver/gold (T2/T5), classificação por palavras-chave (T3), upload com validação e rejeições (T4/T6/T9), histórico de cargas (T2/T6/T9), Docker no 132 (T10), Superset com export versionado (T11), documentação (T12). Sem lacunas.
- **Placeholders:** nenhum TBD/TODO; todo step com código tem o código.
- **Consistência de tipos:** `ParsedRow`/`ParseResult` (T4) usados em T5/T6; `Deps` de `createApp` (T6) implementadas por `runLoad` (T5) e `queryGold`/`listUploads` (T6); tipos de `api.ts` (T7) espelham as colunas das views gold (T2) e a resposta da API (T6); `DashboardPage`/`UploadPage` recebem `lang` conforme `App.tsx` (T7).
