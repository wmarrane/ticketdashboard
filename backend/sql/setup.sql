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
  priority_label_en LowCardinality(String),
  priority_level LowCardinality(String),
  provider String,
  fix_owner String,
  step_pt String,
  step_en String,
  is_open UInt8,
  area LowCardinality(String),
  loaded_at DateTime
) ENGINE = MergeTree ORDER BY ticket_id;

-- Migração idempotente: hint de área vindo do adaptador da fonte
-- (Estoque daily → 'Estoque' / Loop 'Sistema' / Wrike 'Módulo Processo').
ALTER TABLE tickets.bronze_tickets_raw ADD COLUMN IF NOT EXISTS area_hint String;

-- Migração idempotente: responsável pela correção (regra 5) e rótulo de
-- prioridade em inglês (regra 6). A silver é TRUNCATE+INSERT, mas bases já
-- criadas precisam do ALTER (o INSERT usa lista explícita de colunas).
ALTER TABLE tickets.bronze_tickets_raw ADD COLUMN IF NOT EXISTS fix_owner String;
ALTER TABLE tickets.silver_tickets ADD COLUMN IF NOT EXISTS fix_owner String;
ALTER TABLE tickets.silver_tickets ADD COLUMN IF NOT EXISTS priority_label_en LowCardinality(String);

-- Cache persistente de traduções de título (PT->EN). A tradução assíncrona
-- (LibreTranslate, em segundo plano) grava aqui; o rebuild da silver faz LEFT
-- JOIN por task_name. Como a bronze é imutável e a silver é reconstruída a
-- cada carga, o cache é o que faz a tradução sobreviver aos reprocessamentos.
-- ReplacingMergeTree(updated_at): a última tradução de cada task_name vence.
CREATE TABLE IF NOT EXISTS tickets.title_translations (
  task_name String,
  task_name_en String,
  updated_at DateTime
) ENGINE = ReplacingMergeTree(updated_at) ORDER BY task_name;

-- Prioridade editável pelo usuário (edição inline no dashboard). O rebuild da
-- silver faz LEFT JOIN por ticket_id e sobrepõe a prioridade da fonte, então a
-- edição sobrevive a reprocessamentos e a novas cargas. A bronze permanece
-- imutável. ReplacingMergeTree(updated_at): a última edição de cada ticket vence.
CREATE TABLE IF NOT EXISTS tickets.ticket_overrides (
  ticket_id String,
  priority_label String,
  priority_level String,
  status String,
  updated_at DateTime
) ENGINE = ReplacingMergeTree(updated_at) ORDER BY ticket_id;

-- Migração idempotente: override de status (página de manutenção). Cada linha
-- carrega o estado completo (status + prioridade); a última por updated_at vence.
ALTER TABLE tickets.ticket_overrides ADD COLUMN IF NOT EXISTS status String;

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
  round(count() / sum(count()) OVER (), 4) AS pct
FROM tickets.silver_tickets
GROUP BY status
ORDER BY qty DESC;

CREATE OR REPLACE VIEW tickets.gold_priority_distribution AS
SELECT
  priority_label,
  priority_label_en,
  count() AS qty,
  round(count() / sum(count()) OVER (), 4) AS pct
FROM tickets.silver_tickets
WHERE priority_label != ''
GROUP BY priority_label, priority_label_en
ORDER BY qty DESC;

CREATE OR REPLACE VIEW tickets.gold_priority_levels AS
SELECT
  priority_level,
  count() AS qty,
  round(count() / sum(count()) OVER (), 4) AS pct
FROM tickets.silver_tickets
WHERE priority_level != ''
GROUP BY priority_level
ORDER BY priority_level ASC;

CREATE OR REPLACE VIEW tickets.gold_top5_financeiro AS
SELECT ticket_id, task_name, task_name_en, priority_level, priority_label,
       priority_label_en, status, step_pt, step_en, responsible, fix_owner, due_date
FROM tickets.silver_tickets
WHERE area = 'Financeiro' AND is_open = 1
ORDER BY (priority_level = ''), priority_level ASC
LIMIT 5;

CREATE OR REPLACE VIEW tickets.gold_top5_estoque AS
SELECT ticket_id, task_name, task_name_en, priority_level, priority_label,
       priority_label_en, status, step_pt, step_en, responsible, fix_owner, due_date
FROM tickets.silver_tickets
WHERE area = 'Estoque' AND is_open = 1
ORDER BY (priority_level = ''), priority_level ASC
LIMIT 5;

CREATE OR REPLACE VIEW tickets.gold_open_tickets AS
SELECT ticket_id, task_name, task_name_en, priority_label, priority_label_en,
       priority_level, status, step_pt, step_en, responsible, fix_owner,
       provider, due_date, area
FROM tickets.silver_tickets
WHERE is_open = 1
ORDER BY (priority_level = ''), priority_level ASC, ticket_id ASC;
