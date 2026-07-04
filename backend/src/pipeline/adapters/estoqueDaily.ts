import { clean, normalizeStatus, syntheticId, toIsoDate, type SourceAdapter } from './shared.js';

// Daily ERP Estoque/SIMCARD. Cabeçalho normalizado: 'CARD´s ' → 'cards'.
const E = {
  cards: 'cards',
  problema: 'problema relatado',
  prioridade: 'prioridade',
  time: 'time',
  status: 'status',
  previsao: 'previsão correção',
  owner: 'owner',
  detalhe: 'detalhe',
};

function priority(v: unknown): { level: string; label: string } {
  const s = clean(v);
  if (!s) return { level: '', label: '' };
  const n = Number(s);
  if (!Number.isFinite(n)) return { level: '', label: s };
  const p = Math.trunc(n);
  const label = p <= 0 ? 'Urgente!' : p === 1 ? 'Alta' : p === 2 ? 'Normal' : 'Baixa';
  return { level: `P${p}`, label };
}

export const estoqueDaily: SourceAdapter = {
  name: 'Estoque daily',
  matches: (headers) =>
    [E.cards, E.problema, E.previsao].every((h) => headers.includes(h)),
  mapRow: (rec) => {
    const taskName = clean(rec[E.problema]);
    const rawId = clean(rec[E.cards]);
    const ticketId = rawId && rawId !== '-'
      ? rawId
      : (taskName ? syntheticId('stk', taskName) : '');
    const { level, label } = priority(rec[E.prioridade]);

    // Previsão Correção: Date → due_date; texto livre → vai para o summary.
    const previsao = rec[E.previsao];
    let dueDate: string | null = null;
    const summaryParts = [clean(rec[E.detalhe])];
    if (previsao instanceof Date) {
      dueDate = toIsoDate(previsao);
    } else {
      const text = clean(previsao);
      if (text) summaryParts.push(`Previsão correção: ${text}`);
    }

    return {
      ticketId,
      status: normalizeStatus(rec[E.status]),
      taskName,
      taskNameEn: '',
      dueDate,
      responsible: clean(rec[E.owner]),
      priorityLabel: label,
      priorityLevel: level,
      summary: summaryParts.filter(Boolean).join(' | '),
      provider: clean(rec[E.time]),
      // Regra 5: Time também é o responsável pela correção.
      fixOwner: clean(rec[E.time]),
      areaHint: 'Estoque',
    };
  },
};
