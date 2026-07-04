import { getClient } from '../clickhouse.js';
import type { OpenTicketRow } from './htmlReport.js';

export async function fetchOpenTickets(): Promise<OpenTicketRow[]> {
  const rs = await getClient().query({
    query: 'SELECT * FROM tickets.gold_open_tickets',
    format: 'JSONEachRow',
  });
  return rs.json<OpenTicketRow>();
}
