import { getClient } from '../clickhouse.js';

export interface ExportTicket {
  ticket_id: string;
  source: string;
  status: string;
  task_name: string;
  task_name_en: string;
  due_date: string | null; // 'AAAA-MM-DD'
  responsible: string;
  priority_label: string;
  priority_label_en: string;
  priority_level: string;
  provider: string;
  fix_owner: string;
  step_pt: string;
  step_en: string;
  is_open: number;
}

export interface ExportData {
  generatedAt: Date;
  tickets: ExportTicket[];
}

export async function fetchExportData(): Promise<ExportData> {
  const rs = await getClient().query({
    query: `
      SELECT ticket_id, source, status, task_name, task_name_en,
             due_date, responsible, priority_label, priority_label_en,
             priority_level, provider, fix_owner, step_pt, step_en, is_open
      FROM tickets.silver_tickets
      ORDER BY source, ticket_id
    `,
    format: 'JSONEachRow',
  });
  const tickets = await rs.json<ExportTicket>();
  return { generatedAt: new Date(), tickets };
}
