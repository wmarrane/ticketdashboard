import { clean, type SourceAdapter } from './shared.js';

// Planilha Oracle/CASOS. Cabeçalhos normalizados por normalizeHeader:
// 'Área do produto' → 'área do produto'; 'Número' → 'número'; 'Contato do caso' → 'contato do caso'.
const O = {
  tipo: 'tipo',
  gravidade: 'gravidade',
  contato: 'contato do caso',
  numero: 'número',
  assunto: 'assunto',
  status: 'status',
};

// Prioridade a partir da Gravidade (C1/C2/C3/C4). Fora dessas faixas, deixa
// vazio para o pós-processamento do parser aplicar o default (Normal/P2).
// C1 Crítico → Urgente!/P0 · C2 Urgente → Urgente!/P1 · C3 → Normal/P2 · C4 → Baixa/P3.
function priority(gravidade: string): { level: string; label: string } {
  const g = gravidade.toLowerCase();
  // Códigos C-x têm precedência sobre keyword: o rótulo do C3 contém a palavra
  // 'Urgentes' ('Perguntas Não Urgentes'), e C1/C2 têm o mesmo label Urgente!.
  if (g.includes('c1')) return { level: 'P0', label: 'Urgente!' };
  if (g.includes('c2')) return { level: 'P1', label: 'Urgente!' };
  if (g.includes('c3')) return { level: 'P2', label: 'Normal' };
  if (g.includes('c4')) return { level: 'P3', label: 'Baixa' };
  return { level: '', label: '' };
}

// De-para do campo Status do Oracle para o vocabulário canônico.
const STATUS_MAP: Record<string, string> = {
  'awaiting customer reply': 'Waiting Customer',
  'in progress': 'In Progress',
  'escalated': 'Pendente Terceiros',
};

function status(tipo: string, statusRaw: string): string {
  // 'Request an Enhancement' é sempre uma melhoria, independente do Status.
  if (tipo.trim() === 'Request an Enhancement') return 'Melhoria';
  const s = clean(statusRaw);
  return STATUS_MAP[s.toLowerCase()] ?? s;
}

export const oracleCasos: SourceAdapter = {
  name: 'Oracle (CASOS)',
  matches: (headers) =>
    [O.gravidade, O.numero, O.assunto].every((h) => headers.includes(h)),
  mapRow: (rec) => {
    const { level, label } = priority(clean(rec[O.gravidade]));
    return {
      // Número pode chegar como número (123456) ou texto float ('123456.0').
      ticketId: clean(rec[O.numero]).replace(/\.0$/, ''),
      status: status(clean(rec[O.tipo]), clean(rec[O.status])),
      taskName: clean(rec[O.assunto]),
      taskNameEn: '',
      dueDate: null,
      responsible: clean(rec[O.contato]),
      priorityLabel: label,
      priorityLevel: level,
      summary: '',
      provider: 'Oracle',
      fixOwner: 'Oracle',
      areaHint: '',
    };
  },
};
