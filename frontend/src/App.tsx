import { useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import type { Lang } from './i18n';
import { t } from './i18n';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import MaintenancePage from './pages/MaintenancePage';

export default function App() {
  const [lang, setLang] = useState<Lang>('pt');
  return (
    <div className="app">
      <header>
        <h1>{t(lang, 'title')}</h1>
        <nav>
          <Link to="/">{t(lang, 'dashboard')}</Link>
          <Link to="/upload">{t(lang, 'upload')}</Link>
          <Link to="/manutencao">{t(lang, 'maintenance')}</Link>
          <button onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}>
            {lang === 'pt' ? 'EN' : 'PT'}
          </button>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<DashboardPage lang={lang} />} />
        <Route path="/upload" element={<UploadPage lang={lang} />} />
        <Route path="/manutencao" element={<MaintenancePage lang={lang} />} />
      </Routes>
    </div>
  );
}
