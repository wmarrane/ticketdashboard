import { getClient } from '../clickhouse.js';
import { buildSilverRefreshSql } from '../pipeline/silverSql.js';

const VALID_LABELS = new Set(['Urgente!', 'Alta', 'Normal', 'Baixa']);
const VALID_LEVELS = new Set(['P0', 'P1', 'P2', 'P3', 'P4', 'P5']);

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
 * Persiste a prioridade editada de um ticket em `ticket_overrides` e reconstrói
 * a silver para refletir o override (LEFT JOIN por ticket_id no rebuild). Como a
 * bronze é imutável e a silver é sempre reconstruída, a edição sobrevive a
 * reprocessamentos e a novos uploads.
 */
export async function updateTicketPriority(
  ticketId: string,
  priorityLabel: string,
  priorityLevel: string,
): Promise<void> {
  if (!ticketId) throw new InvalidPriorityError('ticket_id ausente');
  if (!VALID_LABELS.has(priorityLabel)) {
    throw new InvalidPriorityError(`priority_label inválido: ${priorityLabel}`);
  }
  if (!VALID_LEVELS.has(priorityLevel)) {
    throw new InvalidPriorityError(`priority_level inválido: ${priorityLevel}`);
  }

  const client = getClient();
  await client.insert({
    table: 'tickets.ticket_overrides',
    format: 'JSONEachRow',
    values: [{
      ticket_id: ticketId,
      priority_label: priorityLabel,
      priority_level: priorityLevel,
      updated_at: nowClickhouse(),
    }],
  });

  // Reconstrói a silver para aplicar o override na visão consolidada.
  await client.command({ query: 'TRUNCATE TABLE tickets.silver_tickets' });
  await client.command({ query: buildSilverRefreshSql() });
}
