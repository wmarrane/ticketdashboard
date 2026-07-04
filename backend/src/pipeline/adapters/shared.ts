import { createHash } from 'node:crypto';

export interface ParsedRow {
  ticketId: string; status: string; taskName: string; taskNameEn: string;
  dueDate: string | null; responsible: string; priorityLabel: string;
  priorityLevel: string; summary: string; provider: string;
  areaHint: '' | 'Financeiro' | 'Estoque';
}

/** Linha crua indexada pelo cabeçalho normalizado. */
export type RowRecord = Record<string, unknown>;

export interface SourceAdapter {
  /** Nome exibido em mensagens de erro (layouts aceitos). */
  name: string;
  /** Recebe os cabeçalhos já normalizados (normalizeHeader). */
  matches(headers: string[]): boolean;
  /** Mapeia uma linha para o formato canônico. Validação (id/status) é do parser. */
  mapRow(rec: RowRecord): ParsedRow;
}

export function clean(v: unknown): string {
  return String(v ?? '').replace(/ /g, ' ').trim();
}

export function toIsoDate(v: unknown): string | null {
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

/**
 * Normaliza um cabeçalho para detecção/mapeamento: minúsculas, sem NBSP,
 * sem emojis/pontuação/símbolos (mantém letras acentuadas e dígitos),
 * espaços colapsados. Ex.: '⌛Fix Date' → 'fix date'; 'CARD´s ' → 'cards'.
 */
export function normalizeHeader(v: unknown): string {
  return clean(v)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * ID sintético determinístico: prefixo + 8 primeiros hex do sha1 do título
 * normalizado (minúsculas, espaços colapsados, aparado).
 */
export function syntheticId(prefix: 'loop' | 'stk', title: string): string {
  const normalized = title.toLowerCase().replace(/\s+/g, ' ').trim();
  const hash = createHash('sha1').update(normalized, 'utf8').digest('hex');
  return `${prefix}-${hash.slice(0, 8)}`;
}

// Vocabulário canônico (Wrike): comparação sem emojis, sem acentos, minúsculas.
const STATUS_MAP: Record<string, string> = {
  'a fazer': 'Backlog',
  'melhoria': 'Backlog',
  'concluido': 'Completed',
  'encerrado': 'Completed',
  'corrigido': 'Completed',
  'em andamento': 'In Progress',
  'em analise': 'In Progress',
  'in progress': 'In Progress',
  'pendente': 'Pendente Terceiros',
  'aguardando': 'Waiting Customer',
  'em espera': 'Waiting Customer',
  'homologacao nao ok': 'Development Team',
  'validacao': 'Validation',
  'uat': 'Validation',
  'cancelado': 'Cancelled',
};

/**
 * Normaliza status de fontes não canônicas: remove emojis/símbolos/pontuação
 * no início e no fim, apara e mapeia para o vocabulário Wrike;
 * não mapeado → texto limpo original.
 */
export function normalizeStatus(v: unknown): string {
  const s = clean(v)
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[^\p{L}\p{N}]+$/u, '')
    .trim();
  if (!s) return '';
  const key = stripDiacritics(s).toLowerCase();
  return STATUS_MAP[key] ?? s;
}
