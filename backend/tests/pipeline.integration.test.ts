import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSpreadsheet } from '../src/pipeline/parser';
import { runLoad } from '../src/pipeline/loader';
import { getClient } from '../src/clickhouse';

const RUN = process.env.RUN_INTEGRATION === '1';

describe.skipIf(!RUN)('pipeline completo', () => {
  it('carrega planilha de exemplo até a gold', async () => {
    const buf = readFileSync('../personaladmin/2026_07_02_Cards_Ituran_Contrato_Squad.xlsx');
    const parsed = parseSpreadsheet(buf);
    expect(parsed.rows.length).toBeGreaterThan(50);

    const result = await runLoad('office365', 'exemplo.xlsx', parsed);
    expect(result.rowsAccepted).toBe(parsed.rows.length);

    const client = getClient();
    const rs = await client.query({
      query: 'SELECT * FROM tickets.gold_big_numbers', format: 'JSONEachRow',
    });
    // As colunas da gold_big_numbers são UInt64 (count/countIf), e o ClickHouse
    // serializa inteiros de 64 bits como string em JSON por padrão
    // (output_format_json_quote_64bit_integers = 1). Converter aqui deixa o
    // teste independente da configuração do servidor — antes ele dependia de um
    // ajuste não versionado que existia na VM e não em uma instalação padrão.
    const [raw] = await rs.json<Record<string, string | number>>();
    const big = {
      total_tickets: Number(raw.total_tickets),
      open_items: Number(raw.open_items),
      completed: Number(raw.completed),
    };
    expect(big.total_tickets).toBeGreaterThan(0);
    expect(big.open_items + big.completed).toBeLessThanOrEqual(big.total_tickets);
  }, 30000);
});
