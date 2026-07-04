import { useEffect, useState } from 'react';
import { fetchDashboard, type DashboardData, type TicketRow } from '../api';
import { t, type Lang } from '../i18n';
import BigNumber from '../components/BigNumber';
import DataTable from '../components/DataTable';

const pctFmt = (p: number) => `${(p * 100).toFixed(1)}%`;

function ticketRows(lang: Lang, tickets: TicketRow[]): (string | number)[][] {
  return tickets.map((tk) => [
    tk.ticket_id,
    lang === 'pt' ? tk.task_name : (tk.task_name_en || tk.task_name),
    tk.priority_level || tk.priority_label,
    lang === 'pt' ? tk.step_pt : tk.step_en,
    tk.responsible,
    tk.due_date ?? '',
  ]);
}

export default function DashboardPage({ lang }: { lang: Lang }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboard().then(setData).catch((e) => setError(String(e)));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>...</p>;
  if (data.bigNumbers.total_tickets === 0) return <p>{t(lang, 'noData')}</p>;

  const ticketHeaders = [t(lang, 'id'), t(lang, 'task'), t(lang, 'priority'),
    t(lang, 'step'), t(lang, 'responsible'), t(lang, 'dueDate')];

  return (
    <main>
      <div className="big-numbers">
        <BigNumber value={data.bigNumbers.total_tickets} label={t(lang, 'totalTickets')} />
        <BigNumber value={data.bigNumbers.urgent_open} label={t(lang, 'urgentOpen')} />
        <BigNumber value={data.bigNumbers.open_items} label={t(lang, 'openItems')} />
        <BigNumber value={data.bigNumbers.completed} label={t(lang, 'completed')} />
      </div>
      <div className="grid">
        <DataTable
          title={t(lang, 'statusDistribution')}
          headers={[t(lang, 'status'), t(lang, 'step'), t(lang, 'qty'), t(lang, 'pct')]}
          rows={data.statusDistribution.map((r) => [r.status, lang === 'pt' ? r.step_pt : r.step_en, r.qty, pctFmt(r.pct)])}
        />
        <DataTable
          title={t(lang, 'priorityDistribution')}
          headers={[t(lang, 'priority'), t(lang, 'qty'), t(lang, 'pct')]}
          rows={data.priorityDistribution.map((r) => [r.priority_label, r.qty, pctFmt(r.pct)])}
        />
        <DataTable
          title={t(lang, 'priorityLevels')}
          headers={[t(lang, 'level'), t(lang, 'qty'), t(lang, 'pct')]}
          rows={data.priorityLevels.map((r) => [r.priority_level, r.qty, pctFmt(r.pct)])}
        />
        <DataTable wide title={t(lang, 'top5Finance')} headers={ticketHeaders} rows={ticketRows(lang, data.top5Financeiro)} />
        <DataTable wide title={t(lang, 'top5Inventory')} headers={ticketHeaders} rows={ticketRows(lang, data.top5Estoque)} />
      </div>
    </main>
  );
}
