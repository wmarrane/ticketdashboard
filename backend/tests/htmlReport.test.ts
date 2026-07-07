import { describe, it, expect } from 'vitest';
import {
  buildDashboardReport, buildOpenTicketsReport,
  type DashboardData, type OpenTicketRow,
} from '../src/report/htmlReport';

const generatedAt = new Date(2026, 6, 4, 15, 30); // 04/07/2026 15:30 local

const ticket = {
  ticket_id: 'NS-1',
  task_name: 'Erro na fatura <script>alert("x")</script>',
  task_name_en: 'Invoice error',
  priority_level: 'P0', priority_label: 'Urgente!', priority_label_en: 'Urgent!',
  status: 'Backlog', step_pt: 'Aguardando atendimento', step_en: 'Awaiting service',
  responsible: 'Maria & João', fix_owner: 'Netsoft', due_date: '2026-07-10',
};

const dash: DashboardData = {
  bigNumbers: { total_tickets: 97, urgent_open: 11, open_items: 41, completed: 43 },
  statusDistribution: [
    { status: 'Backlog', step_pt: 'Aguardando atendimento', step_en: 'Awaiting service', qty: 10, pct: 0.103 },
  ],
  priorityDistribution: [
    { priority_label: 'Urgente!', priority_label_en: 'Urgent!', qty: 5, pct: 0.05 },
    { priority_label: 'Alta', priority_label_en: '', qty: 3, pct: 0.03 },
  ],
  priorityLevels: [{ priority_level: 'P0', qty: 2, pct: 0.02 }],
  top5Financeiro: [ticket],
  top5Estoque: [],
  top5WaitingCustomer: [],
};

const openRow: OpenTicketRow = {
  ticket_id: 'NS-2',
  task_name: 'Ajuste de estoque <b>urgente</b>',
  task_name_en: 'Inventory adjustment',
  priority_label: 'Alta', priority_label_en: 'High', priority_level: 'P1',
  status: 'Em andamento', step_pt: 'Em atendimento', step_en: 'In progress',
  responsible: 'Carlos', fix_owner: 'Squad Finance', provider: 'SISCORP',
  due_date: '2026-08-01', area: 'Estoque',
};

describe('buildDashboardReport', () => {
  it('PT contém big numbers, rótulos e linha de status', () => {
    const html = buildDashboardReport(dash, 'pt', generatedAt);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('Total de Tickets');
    expect(html).toContain('Urgentes Abertos');
    expect(html).toContain('Itens Abertos');
    expect(html).toContain('Concluídos');
    expect(html).toContain('>97<');
    expect(html).toContain('>11<');
    expect(html).toContain('Distribuição por Status');
    expect(html).toContain('Backlog');
    expect(html).toContain('Aguardando atendimento');
    expect(html).toContain('10.3%');
    expect(html).toContain('Top 5 Financeiro');
    expect(html).toContain('Top 5 Estoque');
    expect(html).toContain('04/07/2026 15:30');
  });

  it('EN usa rótulos EN e fallback de priority_label_en', () => {
    const html = buildDashboardReport(dash, 'en', generatedAt);
    expect(html).toContain('Total Tickets');
    expect(html).toContain('Urgent Open');
    expect(html).toContain('Status Distribution');
    expect(html).toContain('Awaiting service');
    expect(html).not.toContain('Aguardando atendimento');
    expect(html).toContain('Urgent!');
    // fallback: priority_label_en vazio → usa priority_label
    expect(html).toContain('Alta');
    expect(html).toContain('Top 5 Finance');
    expect(html).toContain('Invoice error');
  });

  it('escapa HTML nos valores de dados', () => {
    const html = buildDashboardReport(dash, 'pt', generatedAt);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('Maria &amp; João');
  });
});

describe('buildOpenTicketsReport', () => {
  it('PT contém título, total, cabeçalho de fix_owner e linha', () => {
    const html = buildOpenTicketsReport([openRow], 'pt', generatedAt);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('Tickets Abertos');
    expect(html).toContain('Total: 1');
    expect(html).toContain('Resp. Correção');
    expect(html).toContain('Provedor');
    expect(html).toContain('Vencimento');
    expect(html).toContain('Área');
    expect(html).toContain('NS-2');
    expect(html).toContain('Squad Finance');
    expect(html).toContain('SISCORP');
    expect(html).toContain('Alta (P1)');
    expect(html).toContain('Em atendimento');
  });

  it('EN usa cabeçalhos e conteúdo em inglês', () => {
    const html = buildOpenTicketsReport([openRow], 'en', generatedAt);
    expect(html).toContain('Open Tickets');
    expect(html).toContain('Fix Owner');
    expect(html).toContain('Due Date');
    expect(html).toContain('Inventory adjustment');
    expect(html).toContain('High (P1)');
    expect(html).toContain('In progress');
  });

  it('escapa HTML no nome da tarefa', () => {
    const html = buildOpenTicketsReport([openRow], 'pt', generatedAt);
    expect(html).not.toContain('<b>urgente</b>');
    expect(html).toContain('&lt;b&gt;urgente&lt;/b&gt;');
  });
});
