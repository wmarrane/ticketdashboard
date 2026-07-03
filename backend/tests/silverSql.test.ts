import { describe, it, expect } from 'vitest';
import { buildSilverSql } from '../src/pipeline/silverSql';

describe('buildSilverSql', () => {
  const sql = buildSilverSql();

  it('deduplica por ticket_id pegando a carga mais recente', () => {
    expect(sql).toContain('ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY loaded_at DESC)');
  });

  it('usa apenas o último lote de cada fonte', () => {
    expect(sql).toContain('argMax(load_id, loaded_at)');
  });

  it('mapeia status para step_pt e step_en', () => {
    expect(sql).toContain("'Development Team', 'Correção pelo time de dev'");
    expect(sql).toContain("'Development Team', 'Development by Vendor Dev Team'");
    expect(sql).toContain("'Waiting Customer', 'Aguardando retorno do Ituran'");
  });

  it('calcula is_open excluindo Completed/Cancelled/Stopped', () => {
    expect(sql).toContain("NOT IN ('Completed', 'Cancelled', 'Stopped')");
  });

  it('inclui classificação de área', () => {
    expect(sql).toContain("'Financeiro'");
    expect(sql).toContain("'Outros'");
  });
});
