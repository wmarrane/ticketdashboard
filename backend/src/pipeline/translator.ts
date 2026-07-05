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
// Timeout maior para o worker de fundo: um lote de títulos pode levar minutos
// em CPU (VM sem AVX). O upload não espera por isto.
const STRICT_TIMEOUT_MS = 300_000;

async function callLibreTranslate(url: string, titles: string[], timeoutMs: number): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tradução com fallback: sem URL ou em qualquer falha, cai para o glossário.
 * Mantida para usos que não podem falhar; hoje não é usada no fluxo de upload.
 */
export async function translateTitles(titles: string[]): Promise<string[]> {
  if (titles.length === 0) return [];
  const url = config.libretranslateUrl;
  if (!url) return titles.map(translateTitle);
  try {
    return await callLibreTranslate(url, titles, TIMEOUT_MS);
  } catch (err) {
    console.warn(`translateTitles: falha no LibreTranslate, usando glossário (${String(err)})`);
    return titles.map(translateTitle);
  }
}

/**
 * Tradução estrita para o worker de fundo: LANÇA em qualquer falha (URL
 * ausente, timeout, erro HTTP, formato inesperado). O worker deixa os títulos
 * sem tradução para tentar de novo, em vez de gravar glossário no cache
 * persistente (o que mascararia a tradução real para sempre).
 */
export async function translateStrict(titles: string[]): Promise<string[]> {
  if (titles.length === 0) return [];
  const url = config.libretranslateUrl;
  if (!url) throw new Error('LIBRETRANSLATE_URL não configurada');
  return callLibreTranslate(url, titles, STRICT_TIMEOUT_MS);
}
