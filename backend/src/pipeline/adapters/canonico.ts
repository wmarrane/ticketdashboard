import { clean, toIsoDate, type SourceAdapter } from './shared.js';

// Layout canônico (Cards Ituran). Cabeçalhos normalizados por normalizeHeader:
// 'ID Netsoft / Oracle' → 'id netsoft oracle'; 'Nome da Tarefa - ENG' → 'nome da tarefa eng'.
const C = {
  id: 'id netsoft oracle',
  status: 'status',
  nome: 'nome da tarefa',
  nomeEn: 'nome da tarefa eng',
  vencimento: 'data de vencimento',
  responsavel: 'responsável cliente',
  prioridade: 'prioridade',
  priority: 'priority',
  resumo: 'resumo',
  provedor: 'provedor',
};

export const canonico: SourceAdapter = {
  name: 'Canônico (Cards Ituran)',
  matches: (headers) => headers.includes(C.id) && headers.includes(C.status),
  mapRow: (rec) => ({
    ticketId: clean(rec[C.id]),
    status: clean(rec[C.status]),
    taskName: clean(rec[C.nome]),
    taskNameEn: clean(rec[C.nomeEn]),
    dueDate: toIsoDate(rec[C.vencimento]),
    responsible: clean(rec[C.responsavel]),
    priorityLabel: clean(rec[C.prioridade]),
    priorityLevel: clean(rec[C.priority]).toUpperCase(),
    summary: clean(rec[C.resumo]),
    provider: clean(rec[C.provedor]),
    fixOwner: '',
    areaHint: '',
  }),
};
