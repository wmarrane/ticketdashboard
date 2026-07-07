import { useEffect, useState, useCallback } from 'react';
import { fetchDashboard, type DashboardData } from '../api';
import { t, type Lang } from '../i18n';
import BigNumber from '../components/BigNumber';
import DataTable from '../components/DataTable';
import Top5Table from '../components/Top5Table';

const pctFmt = (p: number) => `${(p * 100).toFixed(1)}%`;

export default function DashboardPage({ lang }: { lang: Lang }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    fetchDashboard().then(setData).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>...</p>;
  if (data.bigNumbers.total_tickets === 0) return <p>{t(lang, 'noData')}</p>;

  return (
    <main>
      <div className="toolbar">
        <button className="btn" onClick={() => { window.location.href = '/api/export'; }}>
          {t(lang, 'exportExcel')}
        </button>
        <button className="btn" onClick={() => { window.location.href = '/api/report/dashboard?lang=' + lang; }}>
          {t(lang, 'reportHtml')}
        </button>
        <button className="btn" onClick={() => { window.location.href = '/api/report/open-tickets?lang=' + lang; }}>
          {t(lang, 'openTicketsHtml')}
        </button>
      </div>
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
          rows={data.priorityDistribution.map((r) => [
            lang === 'en' ? r.priority_label_en || r.priority_label : r.priority_label,
            r.qty, pctFmt(r.pct)])}
        />
        <DataTable
          title={t(lang, 'priorityLevels')}
          headers={[t(lang, 'level'), t(lang, 'qty'), t(lang, 'pct')]}
          rows={data.priorityLevels.map((r) => [r.priority_level, r.qty, pctFmt(r.pct)])}
        />
        <Top5Table lang={lang} title={t(lang, 'top5Finance')} rows={data.top5Financeiro} onSaved={reload} />
        <Top5Table lang={lang} title={t(lang, 'top5Inventory')} rows={data.top5Estoque} onSaved={reload} />
        <Top5Table lang={lang} title={t(lang, 'top5Waiting')} rows={data.top5WaitingCustomer} onSaved={reload} />
      </div>
    </main>
  );
}
