import { clean, normalizeStatus, stripDiacritics, syntheticId, toIsoDate, type SourceAdapter } from './shared.js';

// Planilha Loop (Follow up). Cabeçalho normalizado: '⌛Fix Date' → 'fix date'.
const L = {
  card: 'card',
  sistema: 'sistema',
  issues: 'issues',
  solution: 'solution',
  fixTeam: 'fixteam',
  fixDate: 'fix date',
  netsoftCard: 'netsoft card',
  atualizacoes: 'atualizações',
  status: 'status',
};

function areaHint(sistema: string): '' | 'Financeiro' | 'Estoque' {
  const s = stripDiacritics(sistema).toLowerCase();
  if (/billing|finance/.test(s)) return 'Financeiro';
  if (/estoque|wms|inventario/.test(s)) return 'Estoque';
  return '';
}

export const loop: SourceAdapter = {
  name: 'Loop (Follow up)',
  matches: (headers) =>
    [L.fixDate, L.netsoftCard, L.issues].every((h) => headers.includes(h)),
  mapRow: (rec) => {
    const card = clean(rec[L.card]);
    const issues = clean(rec[L.issues]);
    const taskName = [card, issues].filter(Boolean).join(' — ');
    const netsoft = clean(rec[L.netsoftCard]);
    const ticketId = netsoft && netsoft !== '-'
      ? netsoft
      : (taskName ? syntheticId('loop', taskName) : '');
    return {
      ticketId,
      status: normalizeStatus(rec[L.status]),
      taskName,
      taskNameEn: '',
      // Datas pt-BR sem ano ('qua., 20 de mai.') não são parseáveis → null.
      dueDate: toIsoDate(rec[L.fixDate]),
      responsible: clean(rec[L.fixTeam]),
      priorityLabel: '',
      priorityLevel: '',
      summary: [clean(rec[L.solution]), clean(rec[L.atualizacoes])].filter(Boolean).join(' / '),
      provider: '',
      areaHint: areaHint(clean(rec[L.sistema])),
    };
  },
};
