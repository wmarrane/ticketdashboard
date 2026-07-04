export type Lang = 'pt' | 'en';

export const messages: Record<Lang, Record<string, string>> = {
  pt: {
    title: 'Painel de Acompanhamento de Tickets',
    subtitle: 'Status das demandas — NetSuite / Oracle',
    totalTickets: 'Total de Tickets',
    urgentOpen: 'Urgentes Abertos',
    openItems: 'Itens Abertos',
    completed: 'Concluídos',
    statusDistribution: 'Distribuição por Status',
    priorityDistribution: 'Distribuição por Prioridade',
    priorityLevels: 'Níveis de Prioridade (P0–P5)',
    top5Finance: 'Top 5 Financeiro',
    top5Inventory: 'Top 5 Estoque',
    status: 'Status', step: 'Etapa', qty: 'Qtd', pct: '%',
    priority: 'Prioridade', level: 'Nível',
    task: 'Tarefa', responsible: 'Responsável', dueDate: 'Vencimento', id: 'ID',
    upload: 'Upload de Planilhas', dashboard: 'Dashboard',
    source: 'Fonte', file: 'Arquivo', send: 'Enviar',
    accepted: 'Linhas aceitas', rejectedRows: 'Linhas rejeitadas',
    history: 'Histórico de cargas', loadedAt: 'Data da carga',
    reason: 'Motivo', row: 'Linha', noData: 'Sem dados — faça um upload.',
    uploadSuccess: 'Carga concluída', uploadError: 'Erro na carga',
  },
  en: {
    title: 'Ticket Tracking Dashboard',
    subtitle: 'NetSuite / Oracle demand status',
    totalTickets: 'Total Tickets',
    urgentOpen: 'Urgent Open',
    openItems: 'Open Items',
    completed: 'Completed',
    statusDistribution: 'Status Distribution',
    priorityDistribution: 'Priority Distribution',
    priorityLevels: 'Priority Levels (P0–P5)',
    top5Finance: 'Top 5 Finance',
    top5Inventory: 'Top 5 Inventory',
    status: 'Status', step: 'Step', qty: 'Qty', pct: '%',
    priority: 'Priority', level: 'Level',
    task: 'Task', responsible: 'Owner', dueDate: 'Due Date', id: 'ID',
    upload: 'Spreadsheet Upload', dashboard: 'Dashboard',
    source: 'Source', file: 'File', send: 'Send',
    accepted: 'Accepted rows', rejectedRows: 'Rejected rows',
    history: 'Load history', loadedAt: 'Loaded at',
    reason: 'Reason', row: 'Row', noData: 'No data — upload a spreadsheet.',
    uploadSuccess: 'Load completed', uploadError: 'Load failed',
  },
};

export function t(lang: Lang, key: string): string {
  return messages[lang][key] ?? key;
}
