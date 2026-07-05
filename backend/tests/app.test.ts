import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { createApp } from '../src/app';

function sheetToBuffer(aoa: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'S');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function xlsxBuffer(): Buffer {
  return sheetToBuffer([
    ['ID Netsoft / Oracle', 'Status', 'Nome da Tarefa'],
    ['1', 'Backlog', 'Teste'],
  ]);
}

function emptyXlsxBuffer(): Buffer {
  return sheetToBuffer([
    ['ID Netsoft / Oracle', 'Status', 'Nome da Tarefa'],
  ]);
}

const fakeDeps = {
  runLoad: vi.fn().mockResolvedValue({ loadId: 'abc', rowsAccepted: 1, rowsRejected: 0 }),
  queryGold: vi.fn().mockResolvedValue({
    bigNumbers: { total_tickets: 97, urgent_open: 11, open_items: 41, completed: 43 },
    statusDistribution: [], priorityDistribution: [], priorityLevels: [],
    top5Financeiro: [], top5Estoque: [],
  }),
  listUploads: vi.fn().mockResolvedValue([]),
  fetchExportData: vi.fn().mockResolvedValue({ generatedAt: new Date(), tickets: [] }),
  fetchOpenTickets: vi.fn().mockResolvedValue([{
    ticket_id: 'NS-2', task_name: 'Ajuste de estoque', task_name_en: 'Inventory adjustment',
    priority_label: 'Alta', priority_label_en: 'High', priority_level: 'P1',
    status: 'Em andamento', step_pt: 'Em atendimento', step_en: 'In progress',
    responsible: 'Carlos', fix_owner: 'Squad Finance', provider: 'SISCORP',
    due_date: '2026-08-01', area: 'Estoque',
  }]),
};

describe('API', () => {
  const app = createApp(fakeDeps);

  it('POST /api/upload aceita xlsx com fonte válida', async () => {
    const res = await request(app).post('/api/upload')
      .field('source', 'wrike')
      .attach('file', xlsxBuffer(), 'board.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.loadId).toBe('abc');
    expect(fakeDeps.runLoad).toHaveBeenCalledWith('wrike', 'board.xlsx', expect.anything());
    expect(res.body.rejected).toEqual([]);
  });

  it('POST /api/upload rejeita requisição sem arquivo', async () => {
    const res = await request(app).post('/api/upload')
      .field('source', 'wrike');
    expect(res.status).toBe(400);
  });

  it('POST /api/upload rejeita requisição JSON não-multipart sem crash', async () => {
    const res = await request(app).post('/api/upload')
      .send({ source: 'wrike' });
    expect(res.status).toBe(400);
  });

  it('POST /api/upload rejeita fonte inválida', async () => {
    const res = await request(app).post('/api/upload')
      .field('source', 'jira')
      .attach('file', xlsxBuffer(), 'board.xlsx');
    expect(res.status).toBe(400);
  });

  it('POST /api/upload rejeita extensão não suportada', async () => {
    const res = await request(app).post('/api/upload')
      .field('source', 'wrike')
      .attach('file', Buffer.from('x'), 'notas.txt');
    expect(res.status).toBe(400);
  });

  it('POST /api/upload rejeita planilha só com cabeçalho (sem apagar dados)', async () => {
    const before = fakeDeps.runLoad.mock.calls.length;
    const res = await request(app).post('/api/upload')
      .field('source', 'office365')
      .attach('file', emptyXlsxBuffer(), 'vazia.xlsx');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Planilha sem linhas válidas.');
    expect(fakeDeps.runLoad.mock.calls.length).toBe(before);
  });

  it('POST /api/upload responde 400 para layout de planilha não reconhecido', async () => {
    const before = fakeDeps.runLoad.mock.calls.length;
    const res = await request(app).post('/api/upload')
      .field('source', 'wrike')
      .attach('file', sheetToBuffer([['Foo', 'Bar'], ['1', '2']]), 'estranha.xlsx');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Layout de planilha não reconhecido/);
    expect(res.body.error).toMatch(/Wrike/);
    expect(fakeDeps.runLoad.mock.calls.length).toBe(before);
  });

  it('POST /api/upload responde 500 genérico sem vazar detalhes internos', async () => {
    const failing = createApp({
      ...fakeDeps,
      runLoad: vi.fn().mockRejectedValue(new Error('senha=123 host interno')),
    });
    const res = await request(failing).post('/api/upload')
      .field('source', 'wrike')
      .attach('file', xlsxBuffer(), 'board.xlsx');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Erro interno.');
  });

  it('GET /api/dashboard retorna agregados da gold', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.bigNumbers.total_tickets).toBe(97);
  });

  it('GET /api/uploads retorna histórico', async () => {
    const res = await request(app).get('/api/uploads');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/export baixa xlsx com headers corretos', async () => {
    const res = await request(app).get('/api/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type'])
      .toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition'])
      .toMatch(/^attachment; filename="\d{4}_\d{2}_\d{2}_Cards_Ituran_Contrato_Squad\.xlsx"$/);
    expect(Number(res.headers['content-length'])).toBeGreaterThan(0);
  });

  it('GET /api/report/dashboard baixa HTML em PT por padrão', async () => {
    const res = await request(app).get('/api/report/dashboard');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-type']).toContain('charset=utf-8');
    expect(res.headers['content-disposition'])
      .toMatch(/^attachment; filename="\d{4}_\d{2}_\d{2}_dashboard_pt\.html"$/);
    expect(res.text).toContain('Total de Tickets');
  });

  it('GET /api/report/dashboard?lang=en baixa HTML em EN', async () => {
    const res = await request(app).get('/api/report/dashboard?lang=en');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition'])
      .toMatch(/^attachment; filename="\d{4}_\d{2}_\d{2}_dashboard_en\.html"$/);
    expect(res.text).toContain('Total Tickets');
  });

  it('GET /api/report/dashboard rejeita lang inválido', async () => {
    const res = await request(app).get('/api/report/dashboard?lang=fr');
    expect(res.status).toBe(400);
  });

  it('GET /api/report/dashboard responde 500 genérico em falha', async () => {
    const failing = createApp({
      ...fakeDeps,
      queryGold: vi.fn().mockRejectedValue(new Error('host interno')),
    });
    const res = await request(failing).get('/api/report/dashboard');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Erro interno.');
  });

  it('GET /api/report/open-tickets baixa HTML PT com filename tickets_abertos', async () => {
    const res = await request(app).get('/api/report/open-tickets?lang=pt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-disposition'])
      .toMatch(/^attachment; filename="\d{4}_\d{2}_\d{2}_tickets_abertos_pt\.html"$/);
    expect(res.text).toContain('Resp. Correção');
    expect(res.text).toContain('NS-2');
  });

  it('GET /api/report/open-tickets?lang=en usa filename open_tickets', async () => {
    const res = await request(app).get('/api/report/open-tickets?lang=en');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition'])
      .toMatch(/^attachment; filename="\d{4}_\d{2}_\d{2}_open_tickets_en\.html"$/);
    expect(res.text).toContain('Fix Owner');
  });

  it('GET /api/report/open-tickets rejeita lang inválido', async () => {
    const res = await request(app).get('/api/report/open-tickets?lang=xx');
    expect(res.status).toBe(400);
  });

  it('PUT /api/tickets/:id/priority chama a dep e responde 200', async () => {
    const updateTicketPriority = vi.fn().mockResolvedValue(undefined);
    const withDep = createApp({ ...fakeDeps, updateTicketPriority });
    const res = await request(withDep).put('/api/tickets/123/priority')
      .send({ priority_label: 'Alta', priority_level: 'P1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(updateTicketPriority).toHaveBeenCalledWith('123', 'Alta', 'P1');
  });

  it('PUT /api/tickets/:id/priority responde 400 para valores inválidos', async () => {
    const updateTicketPriority = vi.fn().mockRejectedValue(new Error('priority_label inválido'));
    const withDep = createApp({ ...fakeDeps, updateTicketPriority });
    const res = await request(withDep).put('/api/tickets/123/priority')
      .send({ priority_label: 'Crítica', priority_level: 'P1' });
    expect(res.status).toBe(400);
  });

  it('PUT /api/tickets/:id/priority responde 500 genérico em falha interna', async () => {
    const updateTicketPriority = vi.fn().mockRejectedValue(new Error('host interno'));
    const withDep = createApp({ ...fakeDeps, updateTicketPriority });
    const res = await request(withDep).put('/api/tickets/123/priority')
      .send({ priority_label: 'Alta', priority_level: 'P1' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Erro interno.');
  });

  it('GET /api/export responde 500 genérico em falha', async () => {
    const failing = createApp({
      ...fakeDeps,
      fetchExportData: vi.fn().mockRejectedValue(new Error('host interno')),
    });
    const res = await request(failing).get('/api/export');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Erro interno.');
  });
});
