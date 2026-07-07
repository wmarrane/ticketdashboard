import { useState, useEffect, useCallback } from 'react';
import { fetchOpenTickets, updateTicket, type OpenTicket } from '../api';
import { t, type Lang } from '../i18n';

const STATUSES = ['Backlog','In Progress','Development Team','Pendente Terceiros','Waiting Customer','Validation','Melhoria','Completed','Stopped','Cancelled'];
const PRIORITY_LABELS = ['Urgente!','Alta','Normal','Baixa'];
const PRIORITY_LEVELS = ['P0','P1','P2','P3','P4','P5'];

interface EditStateM {
  ticketId: string;
  label: string;
  level: string;
  status: string;
  saving: boolean;
  error: string;
}

export default function MaintenancePage({ lang }: { lang: Lang }) {
  const [tickets, setTickets] = useState<OpenTicket[]>([]);
  const [error, setError] = useState('');
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterPriorities, setFilterPriorities] = useState<string[]>([]);
  const [editState, setEditState] = useState<EditStateM | null>(null);

  const reload = useCallback(() => {
    setError('');
    fetchOpenTickets()
      .then(setTickets)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Client-side filtering: empty selection = all; AND across groups, OR within
  const filtered = tickets.filter((tk) => {
    const statusOk = filterStatuses.length === 0 || filterStatuses.includes(tk.status);
    const priorityOk = filterPriorities.length === 0 || filterPriorities.includes(tk.priority_label);
    return statusOk && priorityOk;
  });

  // Indicators computed over filtered rows
  const total = filtered.length;
  const urgentCount = filtered.filter((tk) => tk.priority_label === 'Urgente!').length;
  const distinctStatuses = [...new Set(tickets.map((tk) => tk.status))].sort();
  const statusCounts = STATUSES
    .map((s) => ({ s, n: filtered.filter((tk) => tk.status === s).length }))
    .filter(({ n }) => n > 0);

  function toggleFilter(arr: string[], val: string): string[] {
    return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
  }

  function startEdit(row: OpenTicket) {
    setEditState({ ticketId: row.ticket_id, label: row.priority_label, level: row.priority_level, status: row.status, saving: false, error: '' });
  }

  function cancelEdit() { setEditState(null); }

  async function saveEdit() {
    if (!editState) return;
    setEditState((s) => s ? { ...s, saving: true, error: '' } : s);
    try {
      await updateTicket(editState.ticketId, editState.label, editState.level, editState.status);
      setEditState(null);
      reload();
    } catch (err) {
      setEditState((s) => s ? { ...s, saving: false, error: String(err) } : s);
    }
  }

  if (error) return <p className="error">{error}</p>;

  return (
    <main>
      <h2 style={{ marginBottom: 12, color: '#0b3d66' }}>{t(lang, 'maintenance')}</h2>

      {/* Indicators bar */}
      <div className="indicators-bar">
        <span className="ind-card"><strong>{t(lang, 'openTotal')}:</strong> {total}</span>
        <span className="ind-card urgent"><strong>{t(lang, 'urgents')}:</strong> {urgentCount}</span>
        {statusCounts.map(({ s, n }) => (
          <span key={s} className="ind-card"><strong>{s}:</strong> {n}</span>
        ))}
      </div>

      {/* Filters */}
      <div className="filters card">
        <strong>{t(lang, 'filters')}</strong>
        <div className="filter-group">
          <span>{t(lang, 'status')}:</span>
          {distinctStatuses.map((s) => (
            <label key={s}>
              <input
                type="checkbox"
                checked={filterStatuses.includes(s)}
                onChange={() => setFilterStatuses((prev) => toggleFilter(prev, s))}
              />
              {' '}{s}
            </label>
          ))}
        </div>
        <div className="filter-group">
          <span>{t(lang, 'priority')}:</span>
          {PRIORITY_LABELS.map((p) => (
            <label key={p}>
              <input
                type="checkbox"
                checked={filterPriorities.includes(p)}
                onChange={() => setFilterPriorities((prev) => toggleFilter(prev, p))}
              />
              {' '}{p}
            </label>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card card-wide" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>{t(lang, 'id')}</th>
              <th>{t(lang, 'task')}</th>
              <th>{t(lang, 'status')}</th>
              <th>{t(lang, 'priority')}</th>
              <th>{t(lang, 'step')}</th>
              <th>{t(lang, 'responsible')}</th>
              <th>{t(lang, 'fixOwner')}</th>
              <th>{t(lang, 'provider')}</th>
              <th>{t(lang, 'dueDate')}</th>
              <th>{t(lang, 'area')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const isEditing = editState?.ticketId === row.ticket_id;
              const taskName = lang === 'en' ? (row.task_name_en || row.task_name) : row.task_name;
              const stepName = lang === 'en' ? row.step_en : row.step_pt;
              const priorityLabel = lang === 'en' ? (row.priority_label_en || row.priority_label) : row.priority_label;

              return (
                <tr key={row.ticket_id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{row.ticket_id}</td>
                  <td>{taskName}</td>
                  <td>
                    {isEditing ? (
                      <select
                        value={editState.status}
                        disabled={editState.saving}
                        onChange={(e) => setEditState((s) => s ? { ...s, status: e.target.value } : s)}
                        aria-label="status"
                      >
                        {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                      </select>
                    ) : row.status}
                  </td>
                  <td>
                    {isEditing ? (
                      <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                        <select
                          value={editState.label}
                          disabled={editState.saving}
                          onChange={(e) => setEditState((s) => s ? { ...s, label: e.target.value } : s)}
                          aria-label="priority label"
                        >
                          {PRIORITY_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                        <select
                          value={editState.level}
                          disabled={editState.saving}
                          onChange={(e) => setEditState((s) => s ? { ...s, level: e.target.value } : s)}
                          aria-label="priority level"
                        >
                          {PRIORITY_LEVELS.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
                        </select>
                      </span>
                    ) : `${priorityLabel} (${row.priority_level})`}
                    {isEditing && editState.error && (
                      <span style={{ color: '#b00020', display: 'block', fontSize: '0.8em' }}>{editState.error}</span>
                    )}
                  </td>
                  <td>{stepName}</td>
                  <td>{row.responsible}</td>
                  <td>{row.fix_owner}</td>
                  <td>{row.provider}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{row.due_date ?? ''}</td>
                  <td>{row.area}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {isEditing ? (
                      <>
                        <button className="btn" disabled={editState.saving} onClick={saveEdit} style={{ marginRight: 4 }}>
                          {t(lang, 'save')}
                        </button>
                        <button className="btn" disabled={editState.saving} onClick={cancelEdit}>
                          {t(lang, 'cancel')}
                        </button>
                      </>
                    ) : (
                      <button className="btn" onClick={() => startEdit(row)}>
                        {t(lang, 'edit')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={11} style={{ textAlign: 'center', padding: 24, color: '#666' }}>—</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
