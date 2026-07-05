import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock das dependências antes de importar o worker.
const fakeClient = {
  query: vi.fn(),
  insert: vi.fn().mockResolvedValue(undefined),
  command: vi.fn().mockResolvedValue(undefined),
};
vi.mock('../src/clickhouse', () => ({ getClient: () => fakeClient }));

const translateStrict = vi.fn();
vi.mock('../src/pipeline/translator', () => ({ translateStrict: (t: string[]) => translateStrict(t) }));

const { runTranslationBacklog } = await import('../src/pipeline/translationWorker');

function queryReturning(titles: string[]) {
  return { json: async () => titles.map((task_name) => ({ task_name })) };
}

describe('runTranslationBacklog', () => {
  beforeEach(() => {
    fakeClient.query.mockReset();
    fakeClient.insert.mockClear();
    fakeClient.command.mockClear();
    translateStrict.mockReset();
  });

  it('sem títulos pendentes: não traduz nem reconstrói', async () => {
    fakeClient.query.mockResolvedValue(queryReturning([]));
    await runTranslationBacklog();
    expect(translateStrict).not.toHaveBeenCalled();
    expect(fakeClient.insert).not.toHaveBeenCalled();
    expect(fakeClient.command).not.toHaveBeenCalled();
  });

  it('traduz, grava no cache e reconstrói a silver', async () => {
    fakeClient.query.mockResolvedValue(queryReturning(['Erro de pagamento', 'Relatório de estoque']));
    translateStrict.mockResolvedValue(['Payment error', 'Inventory report']);

    await runTranslationBacklog();

    expect(translateStrict).toHaveBeenCalledWith(['Erro de pagamento', 'Relatório de estoque']);
    const insert = fakeClient.insert.mock.calls[0][0];
    expect(insert.table).toBe('tickets.title_translations');
    expect(insert.values).toEqual([
      expect.objectContaining({ task_name: 'Erro de pagamento', task_name_en: 'Payment error' }),
      expect.objectContaining({ task_name: 'Relatório de estoque', task_name_en: 'Inventory report' }),
    ]);
    // TRUNCATE + INSERT (refresh)
    expect(fakeClient.command).toHaveBeenCalledTimes(2);
    expect(fakeClient.command.mock.calls[0][0].query).toContain('TRUNCATE');
    expect(fakeClient.command.mock.calls[1][0].query).toContain('INSERT INTO tickets.silver_tickets');
  });

  it('lote que falha na tradução não grava nada e para', async () => {
    fakeClient.query.mockResolvedValue(queryReturning(['x']));
    translateStrict.mockRejectedValue(new Error('timeout'));
    await runTranslationBacklog();
    expect(fakeClient.insert).not.toHaveBeenCalled();
    expect(fakeClient.command).not.toHaveBeenCalled();
  });
});
