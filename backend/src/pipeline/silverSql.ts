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
SELECT ticket_id, source, status, task_name, task_name_en,
       toDateOrNull(due_date) AS due_date,
       responsible, priority_label, priority_level, provider,
       ${STEP_PT} AS step_pt,
       ${STEP_EN} AS step_en,
       if(status NOT IN ('Completed', 'Cancelled', 'Stopped'), 1, 0) AS is_open,
       ${areaRegexSql()} AS area,
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
