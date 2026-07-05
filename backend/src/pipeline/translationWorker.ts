import { getClient } from '../clickhouse.js';
import { buildSilverRefreshSql } from './silverSql.js';
import { translateStrict } from './translator.js';

const CHUNK = 8;
let running = false;

function nowClickhouse(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

async function pendingTitles(): Promise<string[]> {
  const rs = await getClient().query({
    query: `SELECT DISTINCT task_name FROM tickets.silver_tickets
            WHERE task_name_en = '' AND task_name != ''`,
    format: 'JSONEachRow',
  });
  const rows = await rs.json<{ task_name: string }>();
  return rows.map((r) => r.task_name);
}

/**
 * Traduz, em segundo plano, os títulos que ainda estão sem inglês na silver
 * (nem da fonte, nem do cache). Roda em lotes: cada lote é traduzido pelo
 * LibreTranslate, gravado no cache persistente `title_translations` e então a
 * silver é reconstruída — assim o inglês real vai aparecendo aos poucos no
 * dashboard/Excel sem bloquear o upload.
 *
 * Idempotente e protegido por lock: uma execução por vez. Se um lote falhar
 * (LibreTranslate indisponível/timeout), para e deixa o restante para a
 * próxima carga — nunca grava glossário no cache.
 */
export async function runTranslationBacklog(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const titles = await pendingTitles();
    if (titles.length === 0) return;

    const client = getClient();
    for (let i = 0; i < titles.length; i += CHUNK) {
      const chunk = titles.slice(i, i + CHUNK);
      let translated: string[];
      try {
        translated = await translateStrict(chunk);
      } catch (err) {
        console.warn(`translationWorker: lote falhou, retoma na próxima carga (${String(err)})`);
        return;
      }
      const updatedAt = nowClickhouse();
      await client.insert({
        table: 'tickets.title_translations',
        format: 'JSONEachRow',
        values: chunk.map((task_name, j) => ({
          task_name, task_name_en: translated[j], updated_at: updatedAt,
        })),
      });
      // Reconstrói a silver para trazer as novas traduções do cache.
      await client.command({ query: 'TRUNCATE TABLE tickets.silver_tickets' });
      await client.command({ query: buildSilverRefreshSql() });
    }
  } finally {
    running = false;
  }
}
