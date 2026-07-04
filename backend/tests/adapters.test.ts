import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSpreadsheet, UnknownLayoutError } from '../src/pipeline/parser';

function buildXlsx(rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'S');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// Cabeçalhos EXATOS das exportações reais (emojis, acentos e espaços incluídos).
const WRIKE_HEADER = ['Nome', 'Status', 'Data de criação', 'Vencimento',
  '🛎️ Request Type Base', 'Módulo/Processo:', 'Responsável', '👔 Customer',
  '‼️ Priority', 'Prioridade', 'Responsável Cliente', 'ID'];

const LOOP_HEADER = ['Comparação', 'Card', 'Tipo de Correção', 'Sistema', 'Issues',
  'Solution', 'Bug/Melhoria', 'FixTeam', 'Aligned Date', '⌛Fix Date',
  'Netsoft Card', 'Atualizações', 'Status'];

const ESTOQUE_HEADER = ['CARD´s ', 'Problema Relatado ', 'Prioridade ', 'Time ',
  'Status ', 'Previsão Correção ', 'Owner ', 'Detalhe'];

function wrikeRow(over: Partial<Record<'nome' | 'status' | 'venc' | 'modulo' | 'priority' | 'prioridade' | 'resp' | 'id', unknown>> = {}): unknown[] {
  return ['IT 013 - Webhook de Invoices', 'Pendente Terceiros', new Date('2026-02-25'),
    '26/02/2026', 'Incidente/Bug', 'Localização - CNAB', 'Maria Vitoria', 'Ituran',
    'P1', 'Alta', 'tarcisio.souza@ituran.com.br', 4384524386]
    .map((v, i) => {
      const keys = ['nome', 'status', undefined, 'venc', undefined, 'modulo', undefined, undefined, 'priority', 'prioridade', 'resp', 'id'];
      const k = keys[i] as keyof typeof over | undefined;
      return k && k in over ? over[k] : v;
    });
}

function loopRow(over: Partial<Record<'card' | 'sistema' | 'issues' | 'solution' | 'fixteam' | 'fixdate' | 'netsoft' | 'atualizacoes' | 'status', unknown>> = {}): unknown[] {
  return ['Reconciliação NS ↔ Integra', 'Billing lag (NS pagou)', 'Base', 'Billing',
    '40 casos com webhook de pagamento sem baixa', 'Reenviados e baixados', '',
    'Squad Finance', 'ter., 19 de mai.', 'qua., 20 de mai.', '', '', '✅ Concluído']
    .map((v, i) => {
      const keys = [undefined, 'card', undefined, 'sistema', 'issues', 'solution', undefined, 'fixteam', undefined, 'fixdate', 'netsoft', 'atualizacoes', 'status'];
      const k = keys[i] as keyof typeof over | undefined;
      return k && k in over ? over[k] : v;
    });
}

function estoqueRow(over: Partial<Record<'card' | 'problema' | 'prioridade' | 'time' | 'status' | 'previsao' | 'owner' | 'detalhe', unknown>> = {}): unknown[] {
  return [560, '500 POCSAG constam instalados no integra ', 0, 'Netsoft ', 'Pendente ',
    new Date('2026-06-16'), 'Rogerio ', '']
    .map((v, i) => {
      const keys = ['card', 'problema', 'prioridade', 'time', 'status', 'previsao', 'owner', 'detalhe'];
      const k = keys[i] as keyof typeof over;
      return k in over ? over[k] : v;
    });
}

describe('adaptador Wrike export', () => {
  it('mapeia linha feliz com ID numérico e vencimento dd/mm/yyyy', () => {
    const { rows, rejected } = parseSpreadsheet(buildXlsx([WRIKE_HEADER, wrikeRow()]));
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      ticketId: '4384524386',
      status: 'Pendente Terceiros',
      taskName: 'IT 013 - Webhook de Invoices',
      dueDate: '2026-02-26',
      responsible: 'tarcisio.souza@ituran.com.br',
      priorityLabel: 'Alta',
      priorityLevel: 'P1',
      areaHint: 'Financeiro',
    });
  });

  it('remove sufixo .0 de ID que chega como texto float', () => {
    const { rows } = parseSpreadsheet(buildXlsx([WRIKE_HEADER, wrikeRow({ id: '4384524386.0' })]));
    expect(rows[0].ticketId).toBe('4384524386');
  });

  it('area_hint: Módulo/Processo com estoque/wms → Estoque; sem keyword → vazio', () => {
    const { rows } = parseSpreadsheet(buildXlsx([WRIKE_HEADER,
      wrikeRow({ modulo: 'WMS - Armazém' }),
      wrikeRow({ modulo: 'Cadastro de Clientes' })]));
    expect(rows[0].areaHint).toBe('Estoque');
    expect(rows[1].areaHint).toBe('');
  });
});

describe('adaptador Loop (Follow up)', () => {
  it('mapeia linha feliz: título Card — Issues, status com emoji, data pt-BR sem ano → null', () => {
    const { rows, rejected } = parseSpreadsheet(buildXlsx([LOOP_HEADER, loopRow()]));
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      status: 'Completed',
      taskName: 'Billing lag (NS pagou) — 40 casos com webhook de pagamento sem baixa',
      dueDate: null,
      responsible: 'Squad Finance',
      areaHint: 'Financeiro',
    });
    expect(rows[0].ticketId).toMatch(/^loop-[0-9a-f]{8}$/);
  });

  it('ID sintético é determinístico: mesmo título → mesmo id; título diferente → id diferente', () => {
    const a = parseSpreadsheet(buildXlsx([LOOP_HEADER, loopRow()]));
    const b = parseSpreadsheet(buildXlsx([LOOP_HEADER, loopRow()]));
    const c = parseSpreadsheet(buildXlsx([LOOP_HEADER, loopRow({ issues: 'outro problema' })]));
    expect(a.rows[0].ticketId).toBe(b.rows[0].ticketId);
    expect(c.rows[0].ticketId).not.toBe(a.rows[0].ticketId);
  });

  it('usa Netsoft Card como ticket_id quando presente', () => {
    const { rows } = parseSpreadsheet(buildXlsx([LOOP_HEADER, loopRow({ netsoft: '6974258' })]));
    expect(rows[0].ticketId).toBe('6974258');
  });

  it('normaliza status: em andamento/pendente/aguardando/validação/cancelado', () => {
    const { rows } = parseSpreadsheet(buildXlsx([LOOP_HEADER,
      loopRow({ status: 'Em andamento' }),
      loopRow({ status: 'Em análise' }),
      loopRow({ status: 'Pendente' }),
      loopRow({ status: 'Aguardando' }),
      loopRow({ status: 'UAT' }),
      loopRow({ status: 'Cancelado' })]));
    expect(rows.map((r) => r.status)).toEqual([
      'In Progress', 'In Progress', 'Pendente Terceiros', 'Waiting Customer', 'Validation', 'Cancelled']);
  });

  it('status não mapeado passa como texto limpo (sem emoji)', () => {
    const { rows } = parseSpreadsheet(buildXlsx([LOOP_HEADER, loopRow({ status: '🔴 Travado' })]));
    expect(rows[0].status).toBe('Travado');
  });

  it('area_hint via Sistema: Estoque/WMS → Estoque; desconhecido → vazio', () => {
    const { rows } = parseSpreadsheet(buildXlsx([LOOP_HEADER,
      loopRow({ sistema: 'Estoque/WMS' }),
      loopRow({ sistema: 'Portal' })]));
    expect(rows[0].areaHint).toBe('Estoque');
    expect(rows[1].areaHint).toBe('');
  });

  it('summary junta Solution e Atualizações', () => {
    const { rows } = parseSpreadsheet(buildXlsx([LOOP_HEADER,
      loopRow({ solution: 'Corrigido', atualizacoes: 'Publicado em 22/05' })]));
    expect(rows[0].summary).toBe('Corrigido / Publicado em 22/05');
  });

  it('rejeita linha sem título e sem Netsoft Card (ticket_id ausente) e linha sem status', () => {
    const { rows, rejected } = parseSpreadsheet(buildXlsx([LOOP_HEADER,
      loopRow({ card: '', issues: '', netsoft: '' }),
      loopRow({ status: '' })]));
    expect(rows).toHaveLength(0);
    expect(rejected).toEqual([
      { rowNumber: 2, reason: 'ticket_id ausente' },
      { rowNumber: 3, reason: 'status ausente' },
    ]);
  });
});

describe('adaptador Estoque daily', () => {
  it('mapeia linha feliz: CARD numérico, prioridade 0, Previsão como Date', () => {
    const { rows, rejected } = parseSpreadsheet(buildXlsx([ESTOQUE_HEADER, estoqueRow()]));
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      ticketId: '560',
      taskName: '500 POCSAG constam instalados no integra',
      status: 'Pendente Terceiros',
      priorityLevel: 'P0',
      priorityLabel: 'Urgente!',
      dueDate: '2026-06-16',
      responsible: 'Rogerio',
      provider: 'Netsoft',
      areaHint: 'Estoque',
    });
  });

  it('CARD "-" gera ID sintético stk- determinístico', () => {
    const a = parseSpreadsheet(buildXlsx([ESTOQUE_HEADER, estoqueRow({ card: '-' })]));
    const b = parseSpreadsheet(buildXlsx([ESTOQUE_HEADER, estoqueRow({ card: '-' })]));
    expect(a.rows[0].ticketId).toMatch(/^stk-[0-9a-f]{8}$/);
    expect(a.rows[0].ticketId).toBe(b.rows[0].ticketId);
  });

  it('mapeia prioridade numérica: 1→P1 Alta, 2→P2 Normal, 3→P3 Baixa', () => {
    const { rows } = parseSpreadsheet(buildXlsx([ESTOQUE_HEADER,
      estoqueRow({ prioridade: 1 }),
      estoqueRow({ prioridade: 2 }),
      estoqueRow({ prioridade: 3 })]));
    expect(rows.map((r) => [r.priorityLevel, r.priorityLabel])).toEqual([
      ['P1', 'Alta'], ['P2', 'Normal'], ['P3', 'Baixa']]);
  });

  it('normaliza status próprios: Concluido→Completed, Em Análise→In Progress', () => {
    const { rows } = parseSpreadsheet(buildXlsx([ESTOQUE_HEADER,
      estoqueRow({ status: 'Concluido ' }),
      estoqueRow({ status: 'Em Análise ' })]));
    expect(rows[0].status).toBe('Completed');
    expect(rows[1].status).toBe('In Progress');
  });

  it('Previsão Correção em texto vai para summary e due_date fica null', () => {
    const { rows } = parseSpreadsheet(buildXlsx([ESTOQUE_HEADER,
      estoqueRow({ previsao: 'Ajustar junto com o script', detalhe: 'obs' })]));
    expect(rows[0].dueDate).toBeNull();
    expect(rows[0].summary).toContain('Ajustar junto com o script');
    expect(rows[0].summary).toContain('obs');
  });
});

describe('auto-detecção de layout', () => {
  it('layout desconhecido lança UnknownLayoutError listando os aceitos', () => {
    const buf = buildXlsx([['Foo', 'Bar'], ['1', '2']]);
    expect(() => parseSpreadsheet(buf)).toThrow(UnknownLayoutError);
    expect(() => parseSpreadsheet(buf)).toThrow(/aceitos/i);
    expect(() => parseSpreadsheet(buf)).toThrow(/Wrike/);
  });

  it('layout canônico continua aceito e sem area_hint', () => {
    const buf = buildXlsx([
      ['ID Netsoft / Oracle', 'Status', 'Nome da Tarefa'],
      ['123', 'Backlog', 'Teste']]);
    const { rows } = parseSpreadsheet(buf);
    expect(rows[0]).toMatchObject({ ticketId: '123', status: 'Backlog', areaHint: '' });
  });

  it('linhas totalmente vazias continuam ignoradas silenciosamente', () => {
    const { rows, rejected } = parseSpreadsheet(buildXlsx([LOOP_HEADER,
      ['', '', '', '', '', '', '', '', '', '', '', '', '']]));
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(0);
  });
});
