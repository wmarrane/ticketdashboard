export type ReportLang = 'pt' | 'en';

export interface BigNumbers {
  total_tickets: number; urgent_open: number; open_items: number; completed: number;
}
export interface StatusRow { status: string; step_pt: string; step_en: string; qty: number; pct: number }
export interface PriorityRow { priority_label: string; priority_label_en: string; qty: number; pct: number }
export interface LevelRow { priority_level: string; qty: number; pct: number }
export interface TicketRow {
  ticket_id: string; task_name: string; task_name_en: string;
  priority_level: string; priority_label: string; priority_label_en: string;
  status: string; step_pt: string; step_en: string; responsible: string;
  fix_owner: string; due_date: string | null;
}
export interface DashboardData {
  bigNumbers: BigNumbers;
  statusDistribution: StatusRow[];
  priorityDistribution: PriorityRow[];
  priorityLevels: LevelRow[];
  top5Financeiro: TicketRow[];
  top5Estoque: TicketRow[];
  top5WaitingCustomer: TicketRow[];
}
export interface OpenTicketRow {
  ticket_id: string; task_name: string; task_name_en: string;
  priority_label: string; priority_label_en: string; priority_level: string;
  status: string; step_pt: string; step_en: string; responsible: string;
  fix_owner: string; provider: string; due_date: string | null; area: string;
}

const LABELS: Record<ReportLang, Record<string, string>> = {
  pt: {
    dashboardTitle: 'Painel de Acompanhamento de Tickets',
    openTicketsTitle: 'Tickets Abertos',
    subtitle: 'Status das demandas — NetSuite / Oracle',
    generatedAt: 'Gerado em',
    totalTickets: 'Total de Tickets',
    urgentOpen: 'Urgentes Abertos',
    openItems: 'Itens Abertos',
    completed: 'Concluídos',
    statusDistribution: 'Distribuição por Status',
    priorityDistribution: 'Distribuição por Prioridade',
    priorityLevels: 'Níveis de Prioridade (P0–P5)',
    top5Finance: 'Top 5 Financeiro',
    top5Inventory: 'Top 5 Estoque',
    top5Waiting: 'Top 5 Aguardando Cliente',
    status: 'Status', step: 'Etapa', qty: 'Qtd', pct: '%',
    priority: 'Prioridade', level: 'Nível',
    task: 'Tarefa', responsible: 'Responsável', dueDate: 'Vencimento', id: 'ID',
    fixOwner: 'Resp. Correção', provider: 'Provedor', area: 'Área',
    total: 'Total',
    footer: 'Relatório gerado automaticamente pelo Painel de Tickets.',
  },
  en: {
    dashboardTitle: 'Ticket Tracking Dashboard',
    openTicketsTitle: 'Open Tickets',
    subtitle: 'NetSuite / Oracle demand status',
    generatedAt: 'Generated at',
    totalTickets: 'Total Tickets',
    urgentOpen: 'Urgent Open',
    openItems: 'Open Items',
    completed: 'Completed',
    statusDistribution: 'Status Distribution',
    priorityDistribution: 'Priority Distribution',
    priorityLevels: 'Priority Levels (P0–P5)',
    top5Finance: 'Top 5 Finance',
    top5Inventory: 'Top 5 Inventory',
    top5Waiting: 'Top 5 Waiting Customer',
    status: 'Status', step: 'Step', qty: 'Qty', pct: '%',
    priority: 'Priority', level: 'Level',
    task: 'Task', responsible: 'Owner', dueDate: 'Due Date', id: 'ID',
    fixOwner: 'Fix Owner', provider: 'Provider', area: 'Area',
    total: 'Total',
    footer: 'Report generated automatically by the Ticket Dashboard.',
  },
};

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const pctFmt = (p: number) => `${(Number(p) * 100).toFixed(1)}%`;

function formatTimestamp(d: Date, lang: ReportLang): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = lang === 'pt'
    ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const CSS = `
* { box-sizing: border-box; margin: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f8; color: #1a2733; padding: 16px; }
.container { max-width: 1200px; margin: 0 auto; }
header h1 { font-size: 1.4rem; color: #0b3d66; }
header p.meta { font-size: 0.85rem; color: #55606b; margin: 4px 0 16px; }
.big-numbers { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.big-number { background: #0b3d66; color: #fff; border-radius: 8px; padding: 16px; text-align: center; }
.big-number-value { display: block; font-size: 2.2rem; font-weight: 800; }
.big-number-label { font-size: 0.85rem; opacity: 0.9; }
.card { background: #fff; border-radius: 8px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 12px; overflow-x: auto; }
.card h2 { font-size: 1rem; margin-bottom: 8px; color: #0b3d66; text-transform: uppercase; }
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e3e8ee; }
th { background: #eef2f6; }
footer { font-size: 0.75rem; color: #55606b; margin-top: 16px; text-align: center; }
`.trim();

function htmlDocument(title: string, lang: ReportLang, generatedAt: Date, body: string): string {
  const L = LABELS[lang];
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="container">
<header>
<h1>${escapeHtml(title)}</h1>
<p class="meta">${L.subtitle} · ${L.generatedAt}: ${formatTimestamp(generatedAt, lang)}</p>
</header>
${body}
<footer>${L.footer} · ${L.generatedAt}: ${formatTimestamp(generatedAt, lang)}</footer>
</div>
</body>
</html>
`;
}

function tableCard(title: string, headers: string[], rows: unknown[][]): string {
  const thead = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const tbody = rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('\n');
  return `<div class="card">
<h2>${escapeHtml(title)}</h2>
<table>
<thead><tr>${thead}</tr></thead>
<tbody>
${tbody}
</tbody>
</table>
</div>`;
}

function bigNumber(value: number, label: string): string {
  return `<div class="big-number"><span class="big-number-value">${escapeHtml(value)}</span><span class="big-number-label">${escapeHtml(label)}</span></div>`;
}

function ticketRows(lang: ReportLang, tickets: TicketRow[]): unknown[][] {
  return tickets.map((tk) => [
    tk.ticket_id,
    lang === 'pt' ? tk.task_name : (tk.task_name_en || tk.task_name),
    tk.priority_level || tk.priority_label,
    lang === 'pt' ? tk.step_pt : tk.step_en,
    tk.responsible,
    tk.due_date ?? '',
  ]);
}

export function buildDashboardReport(data: DashboardData, lang: ReportLang, generatedAt: Date): string {
  const L = LABELS[lang];
  const ticketHeaders = [L.id, L.task, L.priority, L.step, L.responsible, L.dueDate];
  const body = `
<div class="big-numbers">
${bigNumber(data.bigNumbers.total_tickets, L.totalTickets)}
${bigNumber(data.bigNumbers.urgent_open, L.urgentOpen)}
${bigNumber(data.bigNumbers.open_items, L.openItems)}
${bigNumber(data.bigNumbers.completed, L.completed)}
</div>
${tableCard(L.statusDistribution, [L.status, L.step, L.qty, L.pct],
    data.statusDistribution.map((r) => [r.status, lang === 'pt' ? r.step_pt : r.step_en, r.qty, pctFmt(r.pct)]))}
${tableCard(L.priorityDistribution, [L.priority, L.qty, L.pct],
    data.priorityDistribution.map((r) => [
      lang === 'en' ? (r.priority_label_en || r.priority_label) : r.priority_label,
      r.qty, pctFmt(r.pct)]))}
${tableCard(L.priorityLevels, [L.level, L.qty, L.pct],
    data.priorityLevels.map((r) => [r.priority_level, r.qty, pctFmt(r.pct)]))}
${tableCard(L.top5Finance, ticketHeaders, ticketRows(lang, data.top5Financeiro))}
${tableCard(L.top5Inventory, ticketHeaders, ticketRows(lang, data.top5Estoque))}
${tableCard(L.top5Waiting, ticketHeaders, ticketRows(lang, data.top5WaitingCustomer))}
`;
  return htmlDocument(L.dashboardTitle, lang, generatedAt, body);
}

export function buildOpenTicketsReport(rows: OpenTicketRow[], lang: ReportLang, generatedAt: Date): string {
  const L = LABELS[lang];
  const headers = [L.id, L.task, L.priority, L.step, L.responsible, L.fixOwner, L.provider, L.dueDate, L.area];
  const tableRows = rows.map((r) => {
    const label = lang === 'en' ? (r.priority_label_en || r.priority_label) : r.priority_label;
    const priority = r.priority_level ? `${label} (${r.priority_level})` : label;
    return [
      r.ticket_id,
      lang === 'pt' ? r.task_name : (r.task_name_en || r.task_name),
      priority,
      lang === 'pt' ? r.step_pt : r.step_en,
      r.responsible,
      r.fix_owner,
      r.provider,
      r.due_date ?? '',
      r.area,
    ];
  });
  const body = `
<p class="meta"><strong>${L.total}: ${rows.length}</strong></p>
${tableCard(L.openTicketsTitle, headers, tableRows)}
`;
  return htmlDocument(L.openTicketsTitle, lang, generatedAt, body);
}
