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

const ORACLE_HEADER = ['Tipo', 'Área do produto', 'Gravidade', 'Contato do caso',
  'Número', 'Assunto', 'Status', 'Data de envio', 'Data da última mensagem'];

function oracleRow(over: Partial<Record<'tipo' | 'area' | 'gravidade' | 'contato' | 'numero' | 'assunto' | 'status' | 'envio' | 'ultima', unknown>> = {}): unknown[] {
  return ['Report a Problem', 'Financeiro', 'C2 - Urgente', 'cliente@ituran.com.br',
    123456, 'Erro na baixa de fatura', 'In Progress', new Date('2026-07-01'), new Date('2026-07-03')]
    .map((v, i) => {
      const keys = ['tipo', 'area', 'gravidade', 'contato', 'numero', 'assunto', 'status', 'envio', 'ultima'];
      const k = keys[i] as keyof typeof over;
      return k in over ? over[k] : v;
    });
}

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

  it('normaliza status com pontuação no fim: In Progress. → In Progress; canônico passa intacto', () => {
    const { rows } = parseSpreadsheet(buildXlsx([WRIKE_HEADER,
      wrikeRow({ status: 'In Progress.' }),
      wrikeRow({ status: 'Development Team' })]));
    expect(rows[0].status).toBe('In Progress');
    expect(rows[1].status).toBe('Development Team');
  });

  it('area_hint: Módulo/Processo com estoque/wms → Estoque; sem keyword → vazio', () => {
    const { rows } = parseSpreadsheet(buildXlsx([WRIKE_HEADER,
      wrikeRow({ modulo: 'WMS - Armazém' }),
      wrikeRow({ modulo: 'Cadastro de Clientes' })]));
    expect(rows[0].areaHint).toBe('Estoque');
    expect(rows[1].areaHint).toBe('');
  });

  it('regra 1: provider e fix_owner fixos em Netsoft', () => {
    const { rows } = parseSpreadsheet(buildXlsx([WRIKE_HEADER, wrikeRow()]));
    expect(rows[0].provider).toBe('Netsoft');
    expect(rows[0].fixOwner).toBe('Netsoft');
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
      responsible: '',
      fixOwner: 'Squad Finance',
      areaHint: 'Financeiro',
    });
    expect(rows[0].ticketId).toMatch(/^loop-[0-9a-f]{8}$/);
  });

  it('regra 5: FixTeam vira fix_owner e responsible fica vazio', () => {
    const { rows } = parseSpreadsheet(buildXlsx([LOOP_HEADER, loopRow({ fixteam: 'Netsoft' })]));
    expect(rows[0].fixOwner).toBe('Netsoft');
    expect(rows[0].responsible).toBe('');
  });

  it('regra 4: FixTeam Squad Finance → provider SISCORP (case-insensitive, com espaços)', () => {
    const { rows } = parseSpreadsheet(buildXlsx([LOOP_HEADER,
      loopRow({ fixteam: 'Squad Finance' }),
      loopRow({ fixteam: ' squad finance ' }),
      loopRow({ fixteam: 'SQUAD FINANCE' }),
      loopRow({ fixteam: 'Netsoft' })]));
    expect(rows.map((r) => r.provider)).toEqual(['SISCORP', 'SISCORP', 'SISCORP', '']);
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

  it('normaliza vocabulário real do board: a fazer/em espera/encerrado/corrigido/homologação/melhoria', () => {
    const { rows } = parseSpreadsheet(buildXlsx([LOOP_HEADER,
      loopRow({ status: 'A fazer' }),
      loopRow({ status: 'Em espera' }),
      loopRow({ status: 'Encerrado' }),
      loopRow({ status: 'Corrigido' }),
      loopRow({ status: 'Homologação nao ok' }),
      loopRow({ status: 'Homologação não ok' }),
      loopRow({ status: 'Melhoria' })]));
    expect(rows.map((r) => r.status)).toEqual([
      'Backlog', 'Waiting Customer', 'Completed', 'Completed',
      'Development Team', 'Development Team', 'Backlog']);
  });

  it('é case-insensitive e tolera pontuação no fim: MELHORIA, In Progress., Homologação NAO OK', () => {
    const { rows } = parseSpreadsheet(buildXlsx([LOOP_HEADER,
      loopRow({ status: 'MELHORIA' }),
      loopRow({ status: 'In Progress.' }),
      loopRow({ status: 'Homologação NAO OK' })]));
    expect(rows.map((r) => r.status)).toEqual([
      'Backlog', 'In Progress', 'Development Team']);
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

  it('regra 5: coluna Time abastece fix_owner E provider', () => {
    const { rows } = parseSpreadsheet(buildXlsx([ESTOQUE_HEADER, estoqueRow({ time: 'SISCORP ' })]));
    expect(rows[0].fixOwner).toBe('SISCORP');
    expect(rows[0].provider).toBe('SISCORP');
  });
});

describe('adaptador Oracle (CASOS)', () => {
  it('detecta o layout por gravidade + número + assunto', () => {
    const { rows, rejected } = parseSpreadsheet(buildXlsx([ORACLE_HEADER, oracleRow()]));
    expect(rejected).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });

  it('mapeia linha feliz: Número→ticketId, Assunto→taskName, Contato→responsible', () => {
    const { rows } = parseSpreadsheet(buildXlsx([ORACLE_HEADER, oracleRow()]));
    expect(rows[0]).toMatchObject({
      ticketId: '123456',
      taskName: 'Erro na baixa de fatura',
      responsible: 'cliente@ituran.com.br',
      provider: 'Oracle',
      fixOwner: 'Oracle',
      taskNameEn: '',
      dueDate: null,
      areaHint: '',
    });
  });

  it('remove sufixo .0 de Número que chega como texto float', () => {
    const { rows } = parseSpreadsheet(buildXlsx([ORACLE_HEADER, oracleRow({ numero: '123456.0' })]));
    expect(rows[0].ticketId).toBe('123456');
  });

  it('prioridade por Gravidade: C1→Urgente!/P0, C2→Urgente!/P1, C3→Normal/P2, C4→Baixa/P3', () => {
    const { rows } = parseSpreadsheet(buildXlsx([ORACLE_HEADER,
      oracleRow({ gravidade: 'C1 - Crítico' }),
      oracleRow({ gravidade: 'C2 - Urgente' }),
      oracleRow({ gravidade: 'C3 - Orientação / Perguntas Não Urgentes' }),
      oracleRow({ gravidade: 'C4 - Melhorias ou Suporte Não Técnico' })]));
    expect(rows.map((r) => [r.priorityLevel, r.priorityLabel])).toEqual([
      ['P0', 'Urgente!'], ['P1', 'Urgente!'], ['P2', 'Normal'], ['P3', 'Baixa']]);
  });

  it('Gravidade desconhecida cai no default Normal/P2 (pós-processamento)', () => {
    const { rows } = parseSpreadsheet(buildXlsx([ORACLE_HEADER, oracleRow({ gravidade: 'C9 - Sei lá' })]));
    expect(rows[0].priorityLabel).toBe('Normal');
    expect(rows[0].priorityLevel).toBe('P2');
  });

  it('Tipo Request an Enhancement → status Melhoria (independe do campo Status)', () => {
    const { rows } = parseSpreadsheet(buildXlsx([ORACLE_HEADER,
      oracleRow({ tipo: 'Request an Enhancement', status: 'In Progress' })]));
    expect(rows[0].status).toBe('Melhoria');
  });

  it('de-para de Status: Awaiting Customer Reply/In Progress/Escalated', () => {
    const { rows } = parseSpreadsheet(buildXlsx([ORACLE_HEADER,
      oracleRow({ status: 'Awaiting Customer Reply' }),
      oracleRow({ status: 'In Progress' }),
      oracleRow({ status: 'Escalated' })]));
    expect(rows.map((r) => r.status)).toEqual([
      'Waiting Customer', 'In Progress', 'Pendente Terceiros']);
  });

  it('Status desconhecido passa como texto limpo', () => {
    const { rows } = parseSpreadsheet(buildXlsx([ORACLE_HEADER, oracleRow({ status: 'Reopened' })]));
    expect(rows[0].status).toBe('Reopened');
  });
});

describe('regras compartilhadas (pós-processamento do parser)', () => {
  it('regra 2: prioridade vazia → Normal/P2 em todas as fontes (inclusive canônico)', () => {
    const canon = parseSpreadsheet(buildXlsx([
      ['ID Netsoft / Oracle', 'Status', 'Nome da Tarefa', 'Prioridade', 'Priority'],
      ['1', 'Backlog', 'Sem prioridade', '', ''],
      ['2', 'Backlog', 'Só level', '', 'P0']]));
    expect(canon.rows[0].priorityLabel).toBe('Normal');
    expect(canon.rows[0].priorityLevel).toBe('P2');
    // label vazio → 'Normal' SEMPRE, mesmo com level P0/P1 (confirmado no spec)
    expect(canon.rows[1].priorityLabel).toBe('Normal');
    expect(canon.rows[1].priorityLevel).toBe('P0');

    const lp = parseSpreadsheet(buildXlsx([LOOP_HEADER, loopRow()]));
    expect(lp.rows[0].priorityLabel).toBe('Normal');
    expect(lp.rows[0].priorityLevel).toBe('P2');
  });

  it('regra 2: prioridade preenchida não é alterada', () => {
    const { rows } = parseSpreadsheet(buildXlsx([WRIKE_HEADER, wrikeRow()]));
    expect(rows[0].priorityLabel).toBe('Alta');
    expect(rows[0].priorityLevel).toBe('P1');
  });

  it('regra 7: task_name_en vazio fica vazio no parse (tradução acontece no load)', () => {
    const { rows } = parseSpreadsheet(buildXlsx([WRIKE_HEADER,
      wrikeRow({ nome: 'Erro de pagamento na fatura' })]));
    expect(rows[0].taskNameEn).toBe('');
  });

  it('regra 7: task_name_en preenchido no canônico é preservado', () => {
    const { rows } = parseSpreadsheet(buildXlsx([
      ['ID Netsoft / Oracle', 'Status', 'Nome da Tarefa', 'Nome da Tarefa - ENG'],
      ['1', 'Backlog', 'Erro de pagamento', 'Payment issue'],
      ['2', 'Backlog', 'Erro de pagamento', '']]));
    expect(rows[0].taskNameEn).toBe('Payment issue');
    expect(rows[1].taskNameEn).toBe('');
  });

  it('canônico: fix_owner fica vazio', () => {
    const { rows } = parseSpreadsheet(buildXlsx([
      ['ID Netsoft / Oracle', 'Status', 'Nome da Tarefa'],
      ['1', 'Backlog', 'Teste']]));
    expect(rows[0].fixOwner).toBe('');
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
