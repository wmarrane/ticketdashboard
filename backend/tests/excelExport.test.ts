import { describe, it, expect, beforeAll } from 'vitest';
import ExcelJS from 'exceljs';
import { buildWorkbook } from '../src/export/excelExport';
import type { ExportData, ExportTicket } from '../src/export/exportData';

function ticket(overrides: Partial<ExportTicket>): ExportTicket {
  return {
    ticket_id: '1',
    source: 'wrike',
    status: 'Backlog',
    task_name: 'Tarefa',
    task_name_en: '',
    due_date: null,
    responsible: '',
    priority_label: '',
    priority_label_en: '',
    priority_level: '',
    provider: '',
    fix_owner: '',
    step_pt: '',
    step_en: '',
    is_open: 1,
    area: '',
    ...overrides,
  };
}

const data: ExportData = {
  generatedAt: new Date(2026, 6, 4), // 04/07/2026
  tickets: [
    ticket({
      ticket_id: '100', source: 'wrike', status: 'In Progress',
      task_name: 'Tarefa Um', task_name_en: 'Task One',
      due_date: '2026-07-10', responsible: 'ana@ituran.com.br',
      priority_label: 'Urgente!', priority_label_en: 'Urgent!', priority_level: 'P0', provider: 'Oracle',
      step_pt: 'Em análise pelo fornecedor', step_en: 'Under Vendor Analysis',
      is_open: 1, area: 'Financeiro',
    }),
    ticket({
      ticket_id: '200', source: 'wrike', status: 'Completed',
      task_name: 'Tarefa Dois', task_name_en: 'Task Two',
      priority_label: 'Normal', priority_label_en: 'Normal', priority_level: 'P3',
      step_pt: 'Em produção', step_en: 'In Production',
      is_open: 0,
    }),
    ticket({
      ticket_id: '300', source: 'loop', status: 'Pendente Terceiros',
      task_name: 'Tarefa Três', task_name_en: 'Task Three',
      due_date: '2026-08-01', responsible: 'bruno@ituran.com.br',
      priority_label: 'Alta', priority_label_en: 'High', priority_level: 'P1', provider: 'Netsoft',
      step_pt: 'Chamado Oracle', step_en: 'Oracle Ticket',
      is_open: 1, area: 'Estoque',
    }),
    ticket({ ticket_id: '400', source: 'office365', status: 'Backlog', task_name: 'Tarefa Quatro' }),
  ],
};

const CARDS_HEADER = [
  'ID Netsoft / Oracle', 'Status', 'Nome da Tarefa', 'Data de Vencimento',
  'Responsável Cliente', 'Prioridade', 'Priority', 'Resumo', 'Status Atual',
  'Comentário Ituran', 'Step', 'Step (EN)', 'Provedor',
  'Rank P0/P1 Ativo (aux)', 'Nome da Tarefa - ENG', 'Fonte',
];

describe('buildWorkbook', () => {
  let wb: ExcelJS.Workbook;

  beforeAll(async () => {
    const buffer = await buildWorkbook(data);
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
  });

  it('gera as 3 abas com os nomes esperados', () => {
    expect(wb.worksheets.map((ws) => ws.name))
      .toEqual(['Cards Ituran', 'Dashboard', 'Dashboard (EN)']);
  });

  it('Cards Ituran tem o cabeçalho com as 16 colunas exatas', () => {
    const ws = wb.getWorksheet('Cards Ituran')!;
    const header = CARDS_HEADER.map((_, i) => ws.getRow(1).getCell(i + 1).value);
    expect(header).toEqual(CARDS_HEADER);
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true);
    const fill = ws.getRow(1).getCell(1).fill as ExcelJS.FillPattern;
    expect(fill.fgColor?.argb).toBe('FFD9E1F2');
  });

  it('Cards Ituran mapeia linha de dados na ordem source, ticket_id', () => {
    const ws = wb.getWorksheet('Cards Ituran')!;
    // ORDER BY source, ticket_id → loop/300 primeiro
    const row = ws.getRow(2);
    expect(row.getCell(1).value).toBe('300');
    expect(row.getCell(2).value).toBe('Pendente Terceiros');
    expect(row.getCell(3).value).toBe('Tarefa Três');
    const due = row.getCell(4).value as Date;
    expect(due).toBeInstanceOf(Date);
    expect(due.toISOString().slice(0, 10)).toBe('2026-08-01');
    expect(row.getCell(5).value).toBe('bruno@ituran.com.br');
    expect(row.getCell(6).value).toBe('Alta');
    expect(row.getCell(7).value).toBe('P1');
    expect(row.getCell(11).value).toBe('Chamado Oracle');
    expect(row.getCell(12).value).toBe('Oracle Ticket');
    expect(row.getCell(13).value).toBe('Netsoft');
    expect(row.getCell(15).value).toBe('Task Three');
    expect(row.getCell(16).value).toBe('loop');
    // total: header + 4 tickets
    expect(ws.actualRowCount).toBe(5);
  });

  it('Dashboard A1 tem título e fill FF1F4E78', () => {
    const ws = wb.getWorksheet('Dashboard')!;
    const a1 = ws.getCell('A1');
    expect(a1.value).toBe('PAINEL DE ACOMPANHAMENTO — ITURAN: CONTRATO SQUAD');
    expect((a1.fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF1F4E78');
    expect(a1.font?.bold).toBe(true);
    expect(a1.font?.color?.argb).toBe('FFFFFFFF');
  });

  it('Dashboard A2 traz a data da exportação', () => {
    const ws = wb.getWorksheet('Dashboard')!;
    expect(ws.getCell('A2').value)
      .toBe('Status das demandas de integração NetSuite × Integra — atualizado em 04/07/2026');
  });

  it('Dashboard big numbers com valores e labels', () => {
    const ws = wb.getWorksheet('Dashboard')!;
    expect(ws.getCell('A4').value).toBe(4); // total
    expect(ws.getCell('C4').value).toBe(1); // Urgente!
    expect(ws.getCell('E4').value).toBe(1); // Pendente Terceiros
    expect(ws.getCell('G4').value).toBe(1); // Completed
    expect(ws.getCell('A5').value).toBe('Total de Cards');
    expect(ws.getCell('C5').value).toBe('Urgentes');
    expect(ws.getCell('E5').value).toBe('Aguardando Terceiros');
    expect(ws.getCell('G5').value).toBe('Concluídas');
    expect((ws.getCell('A4').fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF1F4E78');
  });

  it('Dashboard distribuição por status com % em formato 0.0%', () => {
    const ws = wb.getWorksheet('Dashboard')!;
    expect(ws.getCell('A8').value).toBe('Status');
    // ordem canônica: Backlog(9), In Progress(10)...
    expect(ws.getCell('A10').value).toBe('In Progress');
    expect(ws.getCell('B10').value).toBe(1);
    expect(ws.getCell('C10').value).toBeCloseTo(0.25, 5);
    expect(ws.getCell('C10').numFmt).toBe('0.0%');
    // Total após as 10 linhas de status canônicos (Melhoria incluída): linha 19
    expect(ws.getCell('A19').value).toBe('Total');
    expect(ws.getCell('B19').value).toBe(4);
  });

  it('Dashboard distribuição por prioridade e níveis P0–P5', () => {
    const ws = wb.getWorksheet('Dashboard')!;
    expect(ws.getCell('E9').value).toBe('Urgente!');
    expect(ws.getCell('F9').value).toBe(1);
    expect(ws.getCell('E13').value).toBe('Total');
    expect(ws.getCell('F13').value).toBe(3);
    expect(ws.getCell('E17').value).toBe('P0');
    expect(ws.getCell('F17').value).toBe(1);
    expect(ws.getCell('G17').numFmt).toBe('0.0%');
    expect(ws.getCell('E23').value).toBe('Total');
    expect(ws.getCell('F23').value).toBe(3);
  });

  it('Dashboard lista cards prioritários P0/P1 ativos', () => {
    const ws = wb.getWorksheet('Dashboard')!;
    expect(ws.getCell('I8').value).toBe('Status Wrike');
    // P0 primeiro
    expect(ws.getCell('I9').value).toBe('In Progress');
    expect(ws.getCell('J9').value).toBe('Tarefa Um');
    expect(ws.getCell('K9').value).toBe('10/07/2026');
    expect(ws.getCell('L9').value).toBe('ana@ituran.com.br');
    expect(ws.getCell('M9').value).toBe('Em análise pelo fornecedor');
    expect(ws.getCell('N9').value).toBe('Oracle');
    // P1 depois
    expect(ws.getCell('I10').value).toBe('Pendente Terceiros');
    expect(ws.getCell('J10').value).toBe('Tarefa Três');
  });

  it('Dashboard tem seções de cards prioritários por área (Financeiro/Estoque)', () => {
    const ws = wb.getWorksheet('Dashboard')!;
    // seção principal termina na linha 10 (2 cards) → 2 linhas em branco → título na 13
    expect(ws.getCell('I13').value).toBe('CARDS PRIORITÁRIOS (P0/P1) ATIVOS — FINANCEIRO');
    expect(ws.getCell('I14').value).toBe('Status Wrike');
    expect(ws.getCell('J15').value).toBe('Tarefa Um'); // área Financeiro
    expect(ws.getCell('N15').value).toBe('Oracle');
    // Financeiro termina na 15 → 2 em branco → Estoque na 18
    expect(ws.getCell('I18').value).toBe('CARDS PRIORITÁRIOS (P0/P1) ATIVOS — ESTOQUE');
    expect(ws.getCell('I19').value).toBe('Status Wrike');
    expect(ws.getCell('J20').value).toBe('Tarefa Três'); // área Estoque
    expect(ws.getCell('M20').value).toBe('Chamado Oracle');
  });

  it('Dashboard (EN) tem seções de cards por área em inglês', () => {
    const ws = wb.getWorksheet('Dashboard (EN)')!;
    expect(ws.getCell('I13').value).toBe('ACTIVE PRIORITY CARDS (P0/P1) — FINANCE');
    expect(ws.getCell('J15').value).toBe('Task One');
    expect(ws.getCell('I18').value).toBe('ACTIVE PRIORITY CARDS (P0/P1) — INVENTORY');
    expect(ws.getCell('J20').value).toBe('Task Three');
  });

  it('Dashboard (EN) usa textos em inglês, task_name_en e step_en', () => {
    const ws = wb.getWorksheet('Dashboard (EN)')!;
    expect(ws.getCell('A1').value).toBe('MONITORING DASHBOARD — ITURAN: CONTRATO SQUAD');
    expect(ws.getCell('A5').value).toBe('Total Cards');
    expect(ws.getCell('C5').value).toBe('Urgent');
    expect(ws.getCell('E5').value).toBe('Waiting Third Parties');
    expect(ws.getCell('G5').value).toBe('Completed');
    expect(ws.getCell('A7').value).toBe('DISTRIBUTION BY WRIKE STATUS');
    expect(ws.getCell('A12').value).toBe('Pending Third Parties');
    // Distribuição por prioridade usa priority_label_en vindo da silver
    expect(ws.getCell('E9').value).toBe('Urgent!');
    expect(ws.getCell('E10').value).toBe('High');
    expect(ws.getCell('E11').value).toBe('Normal');
    // 'Baixa' sem ticket na base → fallback do de-para estático
    expect(ws.getCell('E12').value).toBe('Low');
    expect(ws.getCell('I8').value).toBe('Wrike Status');
    expect(ws.getCell('J9').value).toBe('Task One');
    expect(ws.getCell('M9').value).toBe('Under Vendor Analysis');
  });

  it('Dashboard (PT) mantém rótulos de prioridade em português', () => {
    const ws = wb.getWorksheet('Dashboard')!;
    expect(ws.getCell('E9').value).toBe('Urgente!');
    expect(ws.getCell('E10').value).toBe('Alta');
    expect(ws.getCell('E12').value).toBe('Baixa');
  });

  it('Dashboard (EN) faz fallback para task_name quando task_name_en vazio', async () => {
    const only = ticket({
      ticket_id: '9', status: 'Backlog', task_name: 'Só PT', task_name_en: '',
      priority_level: 'P1', is_open: 1,
    });
    const buffer = await buildWorkbook({ generatedAt: new Date(2026, 6, 4), tickets: [only] });
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    expect(wb2.getWorksheet('Dashboard (EN)')!.getCell('J9').value).toBe('Só PT');
  });
});
