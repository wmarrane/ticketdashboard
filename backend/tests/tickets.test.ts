import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do ClickHouse antes de importar o módulo (mesmo estilo do translationWorker.test).
const fakeClient = {
  insert: vi.fn().mockResolvedValue(undefined),
  command: vi.fn().mockResolvedValue(undefined),
};
vi.mock('../src/clickhouse', () => ({ getClient: () => fakeClient }));

const { updateTicketPriority } = await import('../src/routes/tickets');

describe('updateTicketPriority', () => {
  beforeEach(() => {
    fakeClient.insert.mockClear();
    fakeClient.command.mockClear();
  });

  it('rejeita label inválido sem tocar o banco', async () => {
    await expect(updateTicketPriority('123', 'Crítica', 'P1')).rejects.toThrow(/label/i);
    expect(fakeClient.insert).not.toHaveBeenCalled();
    expect(fakeClient.command).not.toHaveBeenCalled();
  });

  it('rejeita level inválido sem tocar o banco', async () => {
    await expect(updateTicketPriority('123', 'Alta', 'P9')).rejects.toThrow(/level/i);
    expect(fakeClient.insert).not.toHaveBeenCalled();
    expect(fakeClient.command).not.toHaveBeenCalled();
  });

  it('rejeita ticket_id vazio', async () => {
    await expect(updateTicketPriority('', 'Alta', 'P1')).rejects.toThrow();
    expect(fakeClient.insert).not.toHaveBeenCalled();
  });

  it('com entrada válida insere override e reconstrói a silver (TRUNCATE + refresh)', async () => {
    await updateTicketPriority('123456', 'Urgente!', 'P0');

    const insert = fakeClient.insert.mock.calls[0][0];
    expect(insert.table).toBe('tickets.ticket_overrides');
    expect(insert.values[0]).toMatchObject({
      ticket_id: '123456', priority_label: 'Urgente!', priority_level: 'P0',
    });
    expect(insert.values[0].updated_at).toBeTruthy();

    // TRUNCATE + INSERT (refresh)
    expect(fakeClient.command).toHaveBeenCalledTimes(2);
    expect(fakeClient.command.mock.calls[0][0].query).toContain('TRUNCATE');
    expect(fakeClient.command.mock.calls[0][0].query).toContain('tickets.silver_tickets');
    expect(fakeClient.command.mock.calls[1][0].query).toContain('INSERT INTO tickets.silver_tickets');
  });

  it('aceita todos os levels P0..P5', async () => {
    for (const lvl of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
      await expect(updateTicketPriority('1', 'Normal', lvl)).resolves.toBeUndefined();
    }
  });
});
