import { describe, it, expect } from 'vitest';
import { buildSilverSql } from '../src/pipeline/silverSql';

describe('buildSilverSql', () => {
  const current = { source: 'office365', loadId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' };
  const sql = buildSilverSql(current);

  it('deduplica por ticket_id pegando a carga mais recente', () => {
    expect(sql).toContain('ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY loaded_at DESC)');
  });

  it('usa o último lote success das demais fontes', () => {
    expect(sql).toContain('argMax(load_id, loaded_at)');
    expect(sql).toContain("status = 'success' AND source != 'office365'");
  });

  it('inclui o lote corrente via UNION ALL (antes do registro success)', () => {
    expect(sql).toContain('UNION ALL');
    expect(sql).toContain(`SELECT 'office365', '${current.loadId}'`);
  });

  it('rejeita fonte desconhecida', () => {
    expect(() => buildSilverSql({ source: 'jira', loadId: current.loadId })).toThrow(/Fonte inválida/);
  });

  it('rejeita load_id que não seja UUID', () => {
    expect(() => buildSilverSql({ source: 'wrike', loadId: "x'; DROP TABLE" })).toThrow(/load_id inválido/);
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

  it('area_hint da fonte tem precedência sobre as keywords', () => {
    expect(sql).toContain("if(area_hint != '', area_hint, multiIf(");
  });
});
