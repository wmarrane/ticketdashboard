import { describe, it, expect } from 'vitest';
import { buildSilverSql, buildSilverRefreshSql } from '../src/pipeline/silverSql';

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

  it('usa lista explícita de colunas no INSERT (robusto a ALTERs)', () => {
    expect(sql).toMatch(/INSERT INTO tickets\.silver_tickets\s*\(/);
    expect(sql).toContain('fix_owner');
    expect(sql).toContain('priority_label_en');
  });

  it('regra 6: deriva priority_label_en de priority_label', () => {
    expect(sql).toContain("priority_label = 'Urgente!', 'Urgent!'");
    expect(sql).toContain("priority_label = 'Alta', 'High'");
    expect(sql).toContain("priority_label = 'Normal', 'Normal'");
    expect(sql).toContain("priority_label = 'Baixa', 'Low'");
  });

  it('regra 3: office365 + provider SISCORP sobrepõe o step', () => {
    expect(sql).toContain(
      "if(source = 'office365' AND provider = 'SISCORP', 'Em atendimento pelo SISCORP',");
    expect(sql).toContain(
      "if(source = 'office365' AND provider = 'SISCORP', 'Handled by SISCORP',");
  });

  it('regra 7: task_name_en usa a fonte ou o cache de traduções', () => {
    expect(sql).toContain('LEFT JOIN');
    expect(sql).toContain('tickets.title_translations');
    expect(sql).toContain('argMax(task_name_en, updated_at)');
    expect(sql).toContain("if(task_name_en != '', task_name_en, coalesce(cached_en, ''))");
  });
});

describe('buildSilverRefreshSql', () => {
  const sql = buildSilverRefreshSql();

  it('reconstrói só a partir das cargas success, sem lote corrente (sem UNION ALL)', () => {
    expect(sql).toContain("status = 'success' GROUP BY source");
    expect(sql).not.toContain('UNION ALL');
  });

  it('também aplica o cache de traduções', () => {
    expect(sql).toContain('tickets.title_translations');
    expect(sql).toContain("if(task_name_en != '', task_name_en, coalesce(cached_en, ''))");
  });
});
