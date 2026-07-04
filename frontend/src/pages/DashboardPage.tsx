import type { Lang } from '../i18n';
import { t } from '../i18n';

export default function DashboardPage({ lang }: { lang: Lang }) {
  return <p>{t(lang, 'dashboard')}</p>;
}
