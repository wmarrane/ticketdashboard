import { getClient } from '../clickhouse.js';
import { buildSilverRefreshSql } from '../pipeline/silverSql.js';

const VALID_LABELS = new Set(['Urgente!', 'Alta', 'Normal', 'Baixa']);
const VALID_LEVELS = new Set(['P0', 'P1', 'P2', 'P3', 'P4', 'P5']);
const VALID_STATUSES = new Set([
  'Backlog', 'In Progress', 'Development Team', 'Pendente Terceiros',
  'Waiting Customer', 'Validation', 'Melhoria', 'Completed', 'Stopped', 'Cancelled',
]);

/** Erro de validação de entrada — a rota traduz para HTTP 400. */
export class InvalidPriorityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPriorityError';
  }
}

function nowClickhouse(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Persiste o override completo de um ticket (status + prioridade) em
 * `ticket_overrides` e reconstrói a silver. Cada edição grava o estado completo
 * — a página de manutenção edita status+prioridade juntos, e a edição do Top 5
 * reenvia o status atual inalterado — evitando override parcial. Como a bronze
 * é imutável e a silver é reconstruída, a edição sobrevive a reprocessamentos.
 */
export async function updateTicket(
  ticketId: string,
  priorityLabel: string,
  priorityLevel: string,
  status: string,
): Promise<void> {
  if (!ticketId) throw new InvalidPriorityError('ticket_id ausente');
  if (!VALID_LABELS.has(priorityLabel)) {
    throw new InvalidPriorityError(`priority_label inválido: ${priorityLabel}`);
  }
  if (!VALID_LEVELS.has(priorityLevel)) {
    throw new InvalidPriorityError(`priority_level inválido: ${priorityLevel}`);
  }
  if (!VALID_STATUSES.has(status)) {
    throw new InvalidPriorityError(`status inválido: ${status}`);
  }

  const client = getClient();
  await client.insert({
    table: 'tickets.ticket_overrides',
    format: 'JSONEachRow',
    values: [{
      ticket_id: ticketId,
      priority_label: priorityLabel,
      priority_level: priorityLevel,
      status,
      updated_at: nowClickhouse(),
    }],
  });

  // Reconstrói a silver para aplicar o override na visão consolidada.
  await client.command({ query: 'TRUNCATE TABLE tickets.silver_tickets' });
  await client.command({ query: buildSilverRefreshSql() });
}
