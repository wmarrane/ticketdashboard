import { describe, it, expect } from 'vitest';
import { classifyArea, areaRegexSql } from '../src/pipeline/areaClassifier';

describe('classifyArea', () => {
  it('classifica Financeiro por palavra-chave (case-insensitive)', () => {
    expect(classifyArea('BRL MR CNAB Delivery file processing')).toBe('Financeiro');
    expect(classifyArea('Erro na emissão de NFS-e')).toBe('Financeiro');
  });

  it('classifica Estoque', () => {
    expect(classifyArea('Erro criação remessa de terceiro 90')).toBe('Estoque');
    expect(classifyArea('Ajuste de inventário CD')).toBe('Estoque');
  });

  it('Financeiro tem precedência sobre Estoque', () => {
    expect(classifyArea('Remessa bancária de pagamento')).toBe('Financeiro');
  });

  it('sem match retorna Outros', () => {
    expect(classifyArea('GESTÃO | Ituran')).toBe('Outros');
  });
});

describe('areaRegexSql', () => {
  it('gera multiIf com Financeiro antes de Estoque', () => {
    const sql = areaRegexSql();
    expect(sql).toContain("'Financeiro'");
    expect(sql).toContain("'Estoque'");
    expect(sql).toContain("'Outros'");
    expect(sql.indexOf('Financeiro')).toBeLessThan(sql.indexOf('Estoque'));
  });
});
