import { clean, normalizeStatus, stripDiacritics, toIsoDate, type SourceAdapter } from './shared.js';

// Export nativo do Wrike. Cabeçalhos normalizados:
// '‼️ Priority' → 'priority'; 'Módulo/Processo:' → 'móduloprocesso'.
const W = {
  nome: 'nome',
  status: 'status',
  vencimento: 'vencimento',
  modulo: 'móduloprocesso',
  priority: 'priority',
  prioridade: 'prioridade',
  responsavelCliente: 'responsável cliente',
  id: 'id',
};

function areaHint(modulo: string): '' | 'Financeiro' | 'Estoque' {
  const m = stripDiacritics(modulo).toLowerCase();
  if (/estoque|wms/.test(m)) return 'Estoque';
  if (/cnab|billing|fiscal|fatura/.test(m)) return 'Financeiro';
  return '';
}

export const wrikeExport: SourceAdapter = {
  name: 'Wrike export',
  matches: (headers) =>
    [W.nome, W.vencimento, W.responsavelCliente, W.id].every((h) => headers.includes(h)),
  mapRow: (rec) => ({
    // ID pode chegar como número (4384524386) ou texto float ('4384524386.0').
    ticketId: clean(rec[W.id]).replace(/\.0$/, ''),
    // Board real traz variantes ('In Progress.', 'Melhoria') → vocabulário canônico.
    status: normalizeStatus(rec[W.status]),
    taskName: clean(rec[W.nome]),
    taskNameEn: '',
    dueDate: toIsoDate(rec[W.vencimento]),
    responsible: clean(rec[W.responsavelCliente]),
    priorityLabel: clean(rec[W.prioridade]),
    priorityLevel: clean(rec[W.priority]).toUpperCase(),
    summary: '',
    provider: '',
    areaHint: areaHint(clean(rec[W.modulo])),
  }),
};
