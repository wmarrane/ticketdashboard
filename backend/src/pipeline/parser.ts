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
  if (v instanceof Date) {
    const offset = new Date().getTimezoneOffset() * 60 * 1000;
    const local = new Date(v.getTime() + offset);
    const y = local.getUTCFullYear();
    const m = String(local.getUTCMonth() + 1).padStart(2, '0');
    const d = String(local.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
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
    const isEmpty = ticketId === '' && status === '' && clean(rec.taskName) === '' &&
      clean(rec.taskNameEn) === '' && clean(rec.dueDate) === '' && clean(rec.responsible) === '' &&
      clean(rec.priorityLabel) === '' && clean(rec.priorityLevel) === '' && clean(rec.summary) === '' &&
      clean(rec.provider) === '';
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
