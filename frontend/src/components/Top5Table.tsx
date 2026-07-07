import { useState } from 'react';
import { updateTicket, type TicketRow } from '../api';
import { t, type Lang } from '../i18n';

const PRIORITY_LABELS = ['Urgente!', 'Alta', 'Normal', 'Baixa'];
const PRIORITY_LEVELS = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];

interface EditState {
  ticketId: string;
  label: string;
  level: string;
  currentStatus: string;
  saving: boolean;
  error: string;
}

interface Props {
  lang: Lang;
  title: string;
  rows: TicketRow[];
  onSaved: () => void;
}

export default function Top5Table({ lang, title, rows, onSaved }: Props) {
  const [editState, setEditState] = useState<EditState | null>(null);

  function startEdit(row: TicketRow) {
    setEditState({
      ticketId: row.ticket_id,
      label: row.priority_label,
      level: row.priority_level,
      currentStatus: row.status,
      saving: false,
      error: '',
    });
  }

  function cancelEdit() {
    setEditState(null);
  }

  async function saveEdit() {
    if (!editState) return;
    setEditState((s) => s ? { ...s, saving: true, error: '' } : s);
    try {
      await updateTicket(editState.ticketId, editState.label, editState.level, editState.currentStatus);
      setEditState(null);
      onSaved();
    } catch (err) {
      setEditState((s) => s ? { ...s, saving: false, error: String(err) } : s);
    }
  }

  const headers = [
    t(lang, 'id'),
    t(lang, 'task'),
    t(lang, 'priority'),
    t(lang, 'step'),
    t(lang, 'responsible'),
    t(lang, 'fixOwner'),
    t(lang, 'dueDate'),
    '',
  ];

  return (
    <div className="card card-wide">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isEditing = editState?.ticketId === row.ticket_id;
            const taskName = lang === 'en' ? (row.task_name_en || row.task_name) : row.task_name;
            const stepName = lang === 'en' ? row.step_en : row.step_pt;
            const priorityLabel = lang === 'en'
              ? (row.priority_label_en || row.priority_label)
              : row.priority_label;
            const priorityDisplay = `${priorityLabel} (${row.priority_level})`;

            return (
              <tr key={row.ticket_id}>
                <td>{row.ticket_id}</td>
                <td>{taskName}</td>
                <td>
                  {isEditing ? (
                    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                      <select
                        value={editState.label}
                        disabled={editState.saving}
                        onChange={(e) => setEditState((s) => s ? { ...s, label: e.target.value } : s)}
                        aria-label="priority label"
                      >
                        {PRIORITY_LABELS.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                      <select
                        value={editState.level}
                        disabled={editState.saving}
                        onChange={(e) => setEditState((s) => s ? { ...s, level: e.target.value } : s)}
                        aria-label="priority level"
                      >
                        {PRIORITY_LEVELS.map((lv) => (
                          <option key={lv} value={lv}>{lv}</option>
                        ))}
                      </select>
                    </span>
                  ) : (
                    priorityDisplay
                  )}
                  {isEditing && editState.error && (
                    <span style={{ color: '#b00020', display: 'block', fontSize: '0.8em' }}>
                      {editState.error}
                    </span>
                  )}
                </td>
                <td>{stepName}</td>
                <td>{row.responsible}</td>
                <td>{row.fix_owner}</td>
                <td>{row.due_date ?? ''}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {isEditing ? (
                    <>
                      <button
                        className="btn"
                        disabled={editState.saving}
                        onClick={saveEdit}
                        style={{ marginRight: 4 }}
                      >
                        {t(lang, 'save')}
                      </button>
                      <button
                        className="btn"
                        disabled={editState.saving}
                        onClick={cancelEdit}
                      >
                        {t(lang, 'cancel')}
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn"
                      onClick={() => startEdit(row)}
                    >
                      {t(lang, 'edit')}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
