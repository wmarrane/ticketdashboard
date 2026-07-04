import { useEffect, useState, type FormEvent } from 'react';
import { uploadFile, fetchUploads, type UploadResult, type UploadHistoryRow } from '../api';
import { t, type Lang } from '../i18n';
import DataTable from '../components/DataTable';

export default function UploadPage({ lang }: { lang: Lang }) {
  const [source, setSource] = useState('wrike');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<UploadHistoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  const loadHistory = () => fetchUploads().then(setHistory).catch(() => {});
  useEffect(() => { loadHistory(); }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setError(''); setResult(null);
    try {
      setResult(await uploadFile(source, file));
      setFile(null);
      setInputKey((k) => k + 1);
      loadHistory();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <form className="upload" onSubmit={onSubmit}>
        <h2>{t(lang, 'upload')}</h2>
        <label>
          {t(lang, 'source')}
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="wrike">Wrike</option>
            <option value="loop">Loop</option>
            <option value="office365">Office 365</option>
          </select>
        </label>
        <label>
          {t(lang, 'file')}
          <input key={inputKey} type="file" accept=".xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button type="submit" disabled={!file || busy}>{t(lang, 'send')}</button>
        {error && <p className="error">{t(lang, 'uploadError')}: {error}</p>}
        {result && (
          <div>
            <p className="result-ok">{t(lang, 'uploadSuccess')} — {t(lang, 'accepted')}: {result.rowsAccepted}, {t(lang, 'rejectedRows')}: {result.rowsRejected}</p>
            {result.rejected.length > 0 && (
              <DataTable
                title={t(lang, 'rejectedRows')}
                headers={[t(lang, 'row'), t(lang, 'reason')]}
                rows={result.rejected.map((r) => [r.rowNumber, r.reason])}
              />
            )}
          </div>
        )}
      </form>
      <DataTable
        title={t(lang, 'history')}
        headers={[t(lang, 'loadedAt'), t(lang, 'source'), t(lang, 'file'), t(lang, 'accepted'), t(lang, 'rejectedRows'), t(lang, 'status')]}
        rows={history.map((h) => [h.loaded_at, h.source, h.file_name, h.rows_accepted, h.rows_rejected, h.status])}
      />
    </main>
  );
}
