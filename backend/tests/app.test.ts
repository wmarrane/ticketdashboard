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
});
