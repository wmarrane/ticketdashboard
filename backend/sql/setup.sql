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
