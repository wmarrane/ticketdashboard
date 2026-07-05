import { randomUUID } from 'node:crypto';
import { getClient } from '../clickhouse.js';
import type { ParseResult } from './parser.js';
import { buildSilverSql } from './silverSql.js';
import { translateTitles } from './translator.js';

export class EmptySpreadsheetError extends Error {
  constructor() {
    super('Planilha sem linhas válidas.');
    this.name = 'EmptySpreadsheetError';
  }
}

export async function runLoad(source: string, fileName: string, parsed: ParseResult) {
  if (parsed.rows.length === 0) throw new EmptySpreadsheetError();

  // Regra 7: títulos sem EN são traduzidos em lote (LibreTranslate, com
  // fallback para o glossário) antes de gravar na bronze.
  const pending = parsed.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !row.taskNameEn);
  if (pending.length > 0) {
    const translated = await translateTitles(pending.map(({ row }) => row.taskName));
    pending.forEach(({ row }, i) => { row.taskNameEn = translated[i]; });
  }

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
      fix_owner: r.fixOwner ?? '',
      area_hint: r.areaHint ?? '',
    })),
  });

  // Reconstrói a silver ANTES de registrar 'success': se a transformação
  // falhar, nenhum registro 'success' é gravado e o lote nunca será
  // selecionado em rebuilds futuros.
  try {
    await client.command({ query: 'TRUNCATE TABLE tickets.silver_tickets' });
    await client.command({ query: buildSilverSql({ source, loadId }) });
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

  await client.insert({
    table: 'tickets.load_history',
    format: 'JSONEachRow',
    values: [{
      load_id: loadId, source, file_name: fileName, loaded_at: loadedAt,
      rows_accepted: parsed.rows.length, rows_rejected: parsed.rejected.length,
      status: 'success', error: '',
    }],
  });

  return { loadId, rowsAccepted: parsed.rows.length, rowsRejected: parsed.rejected.length };
}
