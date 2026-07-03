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
