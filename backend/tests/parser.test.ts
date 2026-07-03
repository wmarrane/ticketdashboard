import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSpreadsheet } from '../src/pipeline/parser';

function buildXlsx(rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cards');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const HEADER = ['ID Netsoft / Oracle', 'Status', 'Nome da Tarefa', 'Data de Vencimento',
  'Responsável Cliente', 'Prioridade', 'Priority', 'Resumo', 'Provedor', 'Nome da Tarefa - ENG'];

describe('parseSpreadsheet', () => {
  it('parseia linha válida com tipagem', () => {
    const buf = buildXlsx([HEADER,
      ['6974258', 'Development Team', 'CNAB separado', new Date('2026-07-15'),
       'glauco@ituran.com.br', 'Alta', 'P2', 'resumo', 'Oracle', 'CNAB split']]);
    const { rows, rejected } = parseSpreadsheet(buf);
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      ticketId: '6974258', status: 'Development Team', taskName: 'CNAB separado',
      priorityLabel: 'Alta', priorityLevel: 'P2', provider: 'Oracle',
      dueDate: '2026-07-15',
    });
  });

  it('rejeita linha sem ticket_id e sem status, com motivo', () => {
    const buf = buildXlsx([HEADER,
      ['', 'Backlog', 'Sem ID', '', '', '', '', '', '', ''],
      ['123', '', 'Sem status', '', '', '', '', '', '', '']]);
    const { rows, rejected } = parseSpreadsheet(buf);
    expect(rows).toHaveLength(0);
    expect(rejected).toEqual([
      { rowNumber: 2, reason: 'ticket_id ausente' },
      { rowNumber: 3, reason: 'status ausente' },
    ]);
  });

  it('normaliza espaços não separáveis no ID', () => {
    const buf = buildXlsx([HEADER,
      ['6955434 ', 'Backlog', 'X', '', '', '', '', '', '', '']]);
    const { rows } = parseSpreadsheet(buf);
    expect(rows[0].ticketId).toBe('6955434');
  });

  it('linha totalmente vazia é ignorada silenciosamente', () => {
    const buf = buildXlsx([HEADER, ['', '', '', '', '', '', '', '', '', '']]);
    const { rows, rejected } = parseSpreadsheet(buf);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(0);
  });
});
