import { config } from '../config.js';
import { translateTitle } from './glossary.js';

const TIMEOUT_MS = 120_000;

/**
 * Traduz títulos PT→EN em lote via LibreTranslate (regra 7).
 * Sem LIBRETRANSLATE_URL configurada, ou em QUALQUER falha (erro de rede,
 * timeout, HTTP != 2xx, resposta com formato inesperado), cai para o
 * glossário estático para TODOS os títulos — o upload nunca falha por
 * causa da tradução.
 */
export async function translateTitles(titles: string[]): Promise<string[]> {
  if (titles.length === 0) return [];
  const url = config.libretranslateUrl;
  if (!url) return titles.map(translateTitle);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: titles, source: 'pt', target: 'en', format: 'text' }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`LibreTranslate HTTP ${res.status}`);
    const data = (await res.json()) as { translatedText?: unknown };
    const out = data.translatedText;
    if (!Array.isArray(out) || out.length !== titles.length
      || !out.every((t) => typeof t === 'string')) {
      throw new Error('Resposta do LibreTranslate em formato inesperado');
    }
    return out as string[];
  } catch (err) {
    console.warn(`translateTitles: falha no LibreTranslate, usando glossário (${String(err)})`);
    return titles.map(translateTitle);
  } finally {
    clearTimeout(timer);
  }
}
