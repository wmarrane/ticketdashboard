import * as XLSX from 'xlsx';
import { ADAPTERS } from './adapters/index.js';
import { clean, normalizeHeader, type ParsedRow, type RowRecord } from './adapters/shared.js';

export type { ParsedRow } from './adapters/shared.js';

export interface ParseResult {
  rows: ParsedRow[];
  rejected: { rowNumber: number; reason: string }[];
}

export class UnknownLayoutError extends Error {
  constructor() {
    super(`Layout de planilha não reconhecido. Layouts aceitos: ${ADAPTERS.map((a) => a.name).join(', ')}.`);
    this.name = 'UnknownLayoutError';
  }
}

export function parseSpreadsheet(buffer: Buffer): ParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (raw.length === 0) return { rows: [], rejected: [] };

  const headers = (raw[0] as unknown[]).map(normalizeHeader);
  const adapter = ADAPTERS.find((a) => a.matches(headers));
  if (!adapter) throw new UnknownLayoutError();

  const rows: ParsedRow[] = [];
  const rejected: ParseResult['rejected'] = [];

  for (let i = 1; i < raw.length; i++) {
    const cells = raw[i] as unknown[];
    if (cells.every((c) => clean(c) === '')) continue; // linha vazia: ignora em silêncio
    const rec: RowRecord = {};
    headers.forEach((h, c) => { if (h) rec[h] = cells[c]; });
    const row = adapter.mapRow(rec);
    // Rejeição APÓS o mapeamento (IDs sintéticos já gerados pelo adaptador):
    // só linhas realmente não identificáveis são rejeitadas.
    if (!row.ticketId) { rejected.push({ rowNumber: i + 1, reason: 'ticket_id ausente' }); continue; }
    if (!row.status) { rejected.push({ rowNumber: i + 1, reason: 'status ausente' }); continue; }
    // Regra 2: prioridade default para TODAS as fontes (inclusive canônico).
    if (!row.priorityLabel) row.priorityLabel = 'Normal';
    if (!row.priorityLevel) row.priorityLevel = 'P2';
    // Regra 7 (tradução do título) acontece no load, em lote (loader.ts).
    rows.push(row);
  }
  return { rows, rejected };
}
