export interface BigNumbers { total_tickets: number; urgent_open: number; open_items: number; completed: number }
export interface StatusRow { status: string; step_pt: string; step_en: string; qty: number; pct: number }
export interface PriorityRow { priority_label: string; priority_label_en: string; qty: number; pct: number }
export interface LevelRow { priority_level: string; qty: number; pct: number }
export interface TicketRow {
  ticket_id: string; task_name: string; task_name_en: string;
  priority_level: string; priority_label: string; priority_label_en: string;
  status: string; step_pt: string; step_en: string; responsible: string;
  fix_owner: string; due_date: string | null;
}
export interface DashboardData {
  bigNumbers: BigNumbers; statusDistribution: StatusRow[];
  priorityDistribution: PriorityRow[]; priorityLevels: LevelRow[];
  top5Financeiro: TicketRow[]; top5Estoque: TicketRow[];
}
export interface UploadResult {
  loadId: string; rowsAccepted: number; rowsRejected: number;
  rejected: { rowNumber: number; reason: string }[];
}
export interface UploadHistoryRow {
  load_id: string; source: string; file_name: string; loaded_at: string;
  rows_accepted: number; rows_rejected: number; status: string; error: string;
}

async function check<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? res.statusText);
  return res.json() as Promise<T>;
}

export const fetchDashboard = () => fetch('/api/dashboard').then((r) => check<DashboardData>(r));
export const fetchUploads = () => fetch('/api/uploads').then((r) => check<UploadHistoryRow[]>(r));

export function uploadFile(source: string, file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('source', source);
  form.append('file', file);
  return fetch('/api/upload', { method: 'POST', body: form }).then((r) => check<UploadResult>(r));
}
