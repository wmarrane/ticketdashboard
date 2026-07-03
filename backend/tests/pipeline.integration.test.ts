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
    const [big] = await rs.json<Record<string, number>>();
    expect(big.total_tickets).toBeGreaterThan(0);
    expect(big.open_items + big.completed).toBeLessThanOrEqual(big.total_tickets);
  }, 30000);
});
