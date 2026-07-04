import { areaRegexSql } from './areaClassifier.js';

// De-para de status -> step (PT/EN), exatamente o do spec.
// Usa multiIf(status = 'X', 'label', ..., '') em vez de transform(): semântica
// idêntica (status fora da lista ficam com step vazio), mas mantém cada par
// status/label adjacente no SQL gerado.
const STEPS: Array<[status: string, pt: string, en: string]> = [
  ['Backlog', 'Não Iniciado', 'Not Started'],
  ['In Progress', 'Em análise pelo fornecedor', 'Under Vendor Analysis'],
  ['Development Team', 'Correção pelo time de dev', 'Development by Vendor Dev Team'],
  ['Pendente Terceiros', 'Chamado Oracle', 'Oracle Ticket'],
  ['Waiting Customer', 'Aguardando retorno do Ituran', "Waiting for Ituran''s Response"],
  ['Validation', 'UAT', 'UAT'],
  ['Completed', 'Em produção', 'In Production'],
];

function stepMultiIf(labelIndex: 1 | 2): string {
  const branches = STEPS.map(
    (s) => `status = '${s[0]}', '${s[labelIndex]}'`,
  ).join(',\n  ');
  return `multiIf(\n  ${branches}, '')`;
}

const STEP_PT = stepMultiIf(1);
const STEP_EN = stepMultiIf(2);

// Regra 6: rótulo de prioridade em inglês derivado do rótulo PT.
const PRIORITY_LABEL_EN = `multiIf(
  priority_label = 'Urgente!', 'Urgent!',
  priority_label = 'Alta', 'High',
  priority_label = 'Normal', 'Normal',
  priority_label = 'Baixa', 'Low', '')`;

// Regra 3: office365 atendido pelo SISCORP sobrepõe o de-para de status.
const SISCORP_OVERRIDE = "source = 'office365' AND provider = 'SISCORP'";

const VALID_SOURCES = new Set(['wrike', 'loop', 'office365']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reconstrói a silver a partir da última carga 'success' de cada fonte,
// substituindo a carga corrente (ainda sem registro no load_history) pelo
// par (source, load_id) recebido — o 'success' só é gravado depois que a
// transformação termina sem erro.
export function buildSilverSql(current: { source: string; loadId: string }): string {
  if (!VALID_SOURCES.has(current.source)) {
    throw new Error(`Fonte inválida para rebuild da silver: ${current.source}`);
  }
  if (!UUID_RE.test(current.loadId)) {
    throw new Error(`load_id inválido para rebuild da silver: ${current.loadId}`);
  }
  return `
INSERT INTO tickets.silver_tickets
  (ticket_id, source, status, task_name, task_name_en, due_date, responsible,
   priority_label, priority_label_en, priority_level, provider, fix_owner,
   step_pt, step_en, is_open, area, loaded_at)
SELECT ticket_id, source, status, task_name, task_name_en,
       toDateOrNull(due_date) AS due_date,
       responsible, priority_label,
       ${PRIORITY_LABEL_EN} AS priority_label_en,
       priority_level, provider, fix_owner,
       if(${SISCORP_OVERRIDE}, 'Em atendimento pelo SISCORP', ${STEP_PT}) AS step_pt,
       if(${SISCORP_OVERRIDE}, 'Handled by SISCORP', ${STEP_EN}) AS step_en,
       if(status NOT IN ('Completed', 'Cancelled', 'Stopped'), 1, 0) AS is_open,
       if(area_hint != '', area_hint, ${areaRegexSql()}) AS area,
       loaded_at
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY loaded_at DESC) AS rn
  FROM tickets.bronze_tickets_raw
  WHERE (source, load_id) IN (
    SELECT source, argMax(load_id, loaded_at) FROM tickets.load_history
    WHERE status = 'success' AND source != '${current.source}' GROUP BY source
    UNION ALL
    SELECT '${current.source}', '${current.loadId}'
  )
)
WHERE rn = 1`;
}
