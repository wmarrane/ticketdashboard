import ExcelJS from 'exceljs';
import type { ExportData, ExportTicket } from './exportData.js';

const NAVY = 'FF1F4E78';
const BLUE = 'FF2E5FAC';
const HEADER_FILL = 'FFD9E1F2';
const BORDER_GREY = 'FFBFBFBF';
const SUBTITLE_GREY = 'FF595959';
const WHITE = 'FFFFFFFF';

const CARDS_HEADER = [
  'ID Netsoft / Oracle', 'Status', 'Nome da Tarefa', 'Data de Vencimento',
  'Responsável Cliente', 'Prioridade', 'Priority', 'Resumo', 'Status Atual',
  'Comentário Ituran', 'Step', 'Step (EN)', 'Provedor',
  'Rank P0/P1 Ativo (aux)', 'Nome da Tarefa - ENG', 'Fonte',
];

const CANONICAL_STATUSES = [
  'Backlog', 'In Progress', 'Development Team', 'Pendente Terceiros',
  'Waiting Customer', 'Validation', 'Completed', 'Stopped', 'Cancelled',
];

const PRIORITY_LABELS = ['Urgente!', 'Alta', 'Normal', 'Baixa'];
const PRIORITY_LEVELS = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];

interface DashboardTexts {
  title: string;
  subtitle: (d: Date) => string;
  bigLabels: [string, string, string, string];
  statusSection: string;
  statusHeader: [string, string, string];
  prioritySection: string;
  priorityHeader: [string, string, string];
  priorityLabel: (row: { label: string; labelEn: string }) => string;
  levelSection: string;
  levelHeader: [string, string, string];
  cardsSection: string;
  cardsHeader: [string, string, string, string, string, string];
  statusName: (s: string) => string;
  total: string;
  taskName: (t: ExportTicket) => string;
  step: (t: ExportTicket) => string;
}

const EN_PRIORITY_FALLBACK: Record<string, string> =
  { 'Urgente!': 'Urgent!', Alta: 'High', Normal: 'Normal', Baixa: 'Low' };

const pad = (n: number) => String(n).padStart(2, '0');
const fmtPt = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const fmtEn = (d: Date) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;

const TEXTS_PT: DashboardTexts = {
  title: 'PAINEL DE ACOMPANHAMENTO — ITURAN: CONTRATO SQUAD',
  subtitle: (d) => `Status das demandas de integração NetSuite × Integra — atualizado em ${fmtPt(d)}`,
  bigLabels: ['Total de Cards', 'Urgentes', 'Aguardando Terceiros', 'Concluídas'],
  statusSection: 'DISTRIBUIÇÃO POR STATUS WRIKE',
  statusHeader: ['Status', 'Qtd', '%'],
  prioritySection: 'DISTRIBUIÇÃO POR PRIORIDADE',
  priorityHeader: ['Prioridade', 'Qtd', '%'],
  priorityLabel: (r) => r.label,
  levelSection: 'NÍVEL DE PRIORIDADE (P0–P5)',
  levelHeader: ['Nível', 'Qtd', '%'],
  cardsSection: 'CARDS PRIORITÁRIOS (P0/P1) ATIVOS — FOCO IMEDIATO',
  cardsHeader: ['Status Wrike', 'Tarefa', 'Vencimento', 'Responsável Cliente', 'Step', 'Provedor'],
  statusName: (s) => s,
  total: 'Total',
  taskName: (t) => t.task_name,
  step: (t) => t.step_pt,
};

const TEXTS_EN: DashboardTexts = {
  title: 'MONITORING DASHBOARD — ITURAN: CONTRATO SQUAD',
  subtitle: (d) => `Status of NetSuite × Integra integration items — updated ${fmtEn(d)}`,
  bigLabels: ['Total Cards', 'Urgent', 'Waiting Third Parties', 'Completed'],
  statusSection: 'DISTRIBUTION BY WRIKE STATUS',
  statusHeader: ['Status', 'Qty', '%'],
  prioritySection: 'DISTRIBUTION BY PRIORITY',
  priorityHeader: ['Priority', 'Qty', '%'],
  // Usa priority_label_en da silver; base sem o rótulo → de-para estático (regra 6).
  priorityLabel: (r) => r.labelEn || EN_PRIORITY_FALLBACK[r.label] || r.label,
  levelSection: 'PRIORITY LEVEL (P0–P5)',
  levelHeader: ['Level', 'Qty', '%'],
  cardsSection: 'ACTIVE PRIORITY CARDS (P0/P1) — IMMEDIATE FOCUS',
  cardsHeader: ['Wrike Status', 'Task', 'Due Date', 'Client Owner', 'Step', 'Provider'],
  statusName: (s) => (s === 'Pendente Terceiros' ? 'Pending Third Parties' : s),
  total: 'Total',
  taskName: (t) => t.task_name_en || t.task_name,
  step: (t) => t.step_en,
};

const solidFill = (argb: string): ExcelJS.FillPattern =>
  ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: BORDER_GREY } },
  bottom: { style: 'thin', color: { argb: BORDER_GREY } },
  left: { style: 'thin', color: { argb: BORDER_GREY } },
  right: { style: 'thin', color: { argb: BORDER_GREY } },
};

function isoToUtcDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtIsoDdMmYyyy(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

interface Aggregates {
  total: number;
  urgent: number;
  waitingThirdParties: number;
  completed: number;
  statusRows: { status: string; qty: number }[];
  priorityRows: { label: string; labelEn: string; qty: number }[];
  priorityTotal: number;
  levelRows: { level: string; qty: number }[];
  levelTotal: number;
  priorityCards: ExportTicket[];
}

function aggregate(tickets: ExportTicket[]): Aggregates {
  const countBy = (fn: (t: ExportTicket) => boolean) => tickets.filter(fn).length;

  const statuses = [...CANONICAL_STATUSES];
  for (const t of tickets) {
    if (t.status && !statuses.includes(t.status)) statuses.push(t.status);
  }
  const statusRows = statuses.map((status) => ({
    status, qty: countBy((t) => t.status === status),
  }));

  // priority_label_en vem da silver (regra 6); vazio → fallback estático na aba EN.
  const priorityRows = PRIORITY_LABELS.map((label) => ({
    label,
    labelEn: tickets.find((t) => t.priority_label === label && t.priority_label_en)
      ?.priority_label_en ?? '',
    qty: countBy((t) => t.priority_label === label),
  }));
  const levelRows = PRIORITY_LEVELS.map((level) => ({
    level, qty: countBy((t) => t.priority_level === level),
  }));

  const priorityCards = tickets
    .filter((t) => (t.priority_level === 'P0' || t.priority_level === 'P1') && Number(t.is_open) === 1)
    .sort((a, b) => a.priority_level.localeCompare(b.priority_level)
      || a.ticket_id.localeCompare(b.ticket_id));

  return {
    total: tickets.length,
    urgent: countBy((t) => t.priority_label === 'Urgente!'),
    waitingThirdParties: countBy((t) => t.status === 'Pendente Terceiros'),
    completed: countBy((t) => t.status === 'Completed'),
    statusRows,
    priorityRows,
    priorityTotal: priorityRows.reduce((s, r) => s + r.qty, 0),
    levelRows,
    levelTotal: levelRows.reduce((s, r) => s + r.qty, 0),
    priorityCards,
  };
}

const pct = (qty: number, denom: number) => (denom > 0 ? qty / denom : 0);

function styleRange(ws: ExcelJS.Worksheet, row: number, cols: string[],
  apply: (cell: ExcelJS.Cell) => void): void {
  for (const col of cols) apply(ws.getCell(`${col}${row}`));
}

function addDashboardSheet(wb: ExcelJS.Workbook, name: string,
  texts: DashboardTexts, agg: Aggregates, generatedAt: Date): void {
  const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }] });

  ws.columns = [
    { width: 20 }, { width: 8 }, { width: 8 }, { width: 3 },
    { width: 22 }, { width: 8 }, { width: 8 }, { width: 3 },
    { width: 20 }, { width: 50 }, { width: 14 }, { width: 30 },
    { width: 30 }, { width: 12 },
  ];

  // Título e subtítulo
  styleRange(ws, 1, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'], (c) => {
    c.fill = solidFill(NAVY);
  });
  const a1 = ws.getCell('A1');
  a1.value = texts.title;
  a1.font = { bold: true, size: 18, color: { argb: WHITE } };
  a1.alignment = { vertical: 'middle' };
  ws.getRow(1).height = 28;
  ws.mergeCells('A1:N1');

  const a2 = ws.getCell('A2');
  a2.value = texts.subtitle(generatedAt);
  a2.font = { size: 10, color: { argb: SUBTITLE_GREY } };
  ws.mergeCells('A2:L2');

  // Big numbers (linha 4) + labels (linha 5)
  const bigValues = [agg.total, agg.urgent, agg.waitingThirdParties, agg.completed];
  const bigCols: [string, string][] = [['A', 'B'], ['C', 'D'], ['E', 'F'], ['G', 'H']];
  ws.getRow(4).height = 36;
  bigCols.forEach(([left, right], i) => {
    for (const row of [4, 5]) {
      styleRange(ws, row, [left, right], (c) => { c.fill = solidFill(NAVY); });
    }
    const v = ws.getCell(`${left}4`);
    v.value = bigValues[i];
    v.font = { bold: true, size: 28, color: { argb: WHITE } };
    v.alignment = { horizontal: 'center', vertical: 'middle' };
    const l = ws.getCell(`${left}5`);
    l.value = texts.bigLabels[i];
    l.font = { bold: true, size: 11, color: { argb: WHITE } };
    l.alignment = { horizontal: 'center' };
    ws.mergeCells(`${left}4:${right}4`);
    ws.mergeCells(`${left}5:${right}5`);
  });

  const sectionTitle = (cell: string, text: string, mergeTo: string) => {
    const range = [cell[0], mergeTo[0]];
    const row = Number(cell.slice(1));
    const cols: string[] = [];
    for (let c = range[0].charCodeAt(0); c <= range[1].charCodeAt(0); c++) {
      cols.push(String.fromCharCode(c));
    }
    styleRange(ws, row, cols, (c) => { c.fill = solidFill(NAVY); });
    const t = ws.getCell(cell);
    t.value = text;
    t.font = { bold: true, size: 12, color: { argb: WHITE } };
    ws.mergeCells(`${cell}:${mergeTo}`);
  };

  const tableHeader = (row: number, cols: string[], labels: string[]) => {
    cols.forEach((col, i) => {
      const c = ws.getCell(`${col}${row}`);
      c.value = labels[i];
      c.font = { bold: true, size: 11 };
      c.fill = solidFill(HEADER_FILL);
      c.border = thinBorder;
    });
  };

  // Distribuição por status (A7..)
  sectionTitle('A7', texts.statusSection, 'C7');
  tableHeader(8, ['A', 'B', 'C'], texts.statusHeader);
  let row = 9;
  for (const s of agg.statusRows) {
    const a = ws.getCell(`A${row}`);
    a.value = texts.statusName(s.status);
    a.fill = solidFill(BLUE);
    a.font = { size: 10, color: { argb: WHITE } };
    a.border = thinBorder;
    const b = ws.getCell(`B${row}`);
    b.value = s.qty;
    b.font = { size: 10 };
    b.border = thinBorder;
    const c = ws.getCell(`C${row}`);
    c.value = pct(s.qty, agg.total);
    c.numFmt = '0.0%';
    c.font = { size: 10 };
    c.border = thinBorder;
    row++;
  }
  const totA = ws.getCell(`A${row}`);
  totA.value = texts.total;
  totA.fill = solidFill(NAVY);
  totA.font = { bold: true, size: 10, color: { argb: WHITE } };
  totA.border = thinBorder;
  const totB = ws.getCell(`B${row}`);
  totB.value = agg.total;
  totB.font = { bold: true, size: 10 };
  totB.border = thinBorder;
  const totC = ws.getCell(`C${row}`);
  totC.value = pct(agg.total, agg.total);
  totC.numFmt = '0.0%';
  totC.font = { bold: true, size: 10 };
  totC.border = thinBorder;

  // Tabela simples de 3 colunas (prioridade / níveis)
  const smallTable = (startRow: number,
    rows: { label: string; qty: number }[], denom: number, totalLabel: string) => {
    let r = startRow;
    for (const item of rows) {
      const e = ws.getCell(`E${r}`);
      e.value = item.label;
      e.font = { size: 10 };
      e.border = thinBorder;
      const f = ws.getCell(`F${r}`);
      f.value = item.qty;
      f.font = { size: 10 };
      f.border = thinBorder;
      const g = ws.getCell(`G${r}`);
      g.value = pct(item.qty, denom);
      g.numFmt = '0.0%';
      g.font = { size: 10 };
      g.border = thinBorder;
      r++;
    }
    const te = ws.getCell(`E${r}`);
    te.value = totalLabel;
    te.font = { bold: true, size: 10 };
    te.border = thinBorder;
    const tf = ws.getCell(`F${r}`);
    tf.value = denom;
    tf.font = { bold: true, size: 10 };
    tf.border = thinBorder;
    const tg = ws.getCell(`G${r}`);
    tg.value = pct(denom, denom);
    tg.numFmt = '0.0%';
    tg.font = { bold: true, size: 10 };
    tg.border = thinBorder;
  };

  // Distribuição por prioridade (E7..E13)
  sectionTitle('E7', texts.prioritySection, 'G7');
  tableHeader(8, ['E', 'F', 'G'], texts.priorityHeader);
  smallTable(9,
    agg.priorityRows.map((r2) => ({ label: texts.priorityLabel(r2), qty: r2.qty })),
    agg.priorityTotal, texts.total);

  // Nível de prioridade (E15..E23)
  sectionTitle('E15', texts.levelSection, 'G15');
  tableHeader(16, ['E', 'F', 'G'], texts.levelHeader);
  smallTable(17,
    agg.levelRows.map((r2) => ({ label: r2.level, qty: r2.qty })),
    agg.levelTotal, texts.total);

  // Cards prioritários (I7..)
  sectionTitle('I7', texts.cardsSection, 'N7');
  tableHeader(8, ['I', 'J', 'K', 'L', 'M', 'N'], texts.cardsHeader);
  let cardRow = 9;
  for (const t of agg.priorityCards) {
    const values = [
      texts.statusName(t.status), texts.taskName(t), fmtIsoDdMmYyyy(t.due_date),
      t.responsible, texts.step(t), t.provider,
    ];
    ['I', 'J', 'K', 'L', 'M', 'N'].forEach((col, i) => {
      const c = ws.getCell(`${col}${cardRow}`);
      c.value = values[i];
      c.font = { size: 10 };
      c.border = thinBorder;
      c.alignment = { vertical: 'top', wrapText: col === 'J' };
    });
    cardRow++;
  }
}

function addCardsSheet(wb: ExcelJS.Workbook, tickets: ExportTicket[]): void {
  const ws = wb.addWorksheet('Cards Ituran');
  const widths = [14.88, 16.06, 55, 14, 30, 11, 9, 65, 30, 45, 26, 26, 12.88, 6.18, 80.35, 14];
  ws.columns = widths.map((width) => ({ width }));

  const headerRow = ws.getRow(1);
  CARDS_HEADER.forEach((label, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = label;
    c.font = { bold: true, size: 10 };
    c.fill = solidFill(HEADER_FILL);
    c.border = thinBorder;
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  headerRow.height = 25.35;

  const sorted = [...tickets].sort((a, b) =>
    a.source.localeCompare(b.source) || a.ticket_id.localeCompare(b.ticket_id));

  sorted.forEach((t, i) => {
    const row = ws.getRow(i + 2);
    const values: (string | Date)[] = [
      t.ticket_id, t.status, t.task_name,
      t.due_date ? isoToUtcDate(t.due_date) : '',
      t.responsible, t.priority_label, t.priority_level,
      '', '', '',
      t.step_pt, t.step_en, t.provider,
      '', t.task_name_en, t.source,
    ];
    values.forEach((v, j) => {
      const c = row.getCell(j + 1);
      c.value = v;
      c.font = { size: 10 };
      c.border = thinBorder;
      if (j === 3 && v instanceof Date) c.numFmt = 'dd/mm/yyyy';
    });
  });

  ws.autoFilter = { from: 'A1', to: `P${sorted.length + 1}` };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

export async function buildWorkbook(data: ExportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = data.generatedAt;
  const agg = aggregate(data.tickets);
  addCardsSheet(wb, data.tickets);
  addDashboardSheet(wb, 'Dashboard', TEXTS_PT, agg, data.generatedAt);
  addDashboardSheet(wb, 'Dashboard (EN)', TEXTS_EN, agg, data.generatedAt);
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
