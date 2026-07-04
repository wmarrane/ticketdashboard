import type { Lang } from '../i18n';
import { t } from '../i18n';

export default function UploadPage({ lang }: { lang: Lang }) {
  return <p>{t(lang, 'upload')}</p>;
}
