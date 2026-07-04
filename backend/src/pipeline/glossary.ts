import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Glossário técnico PT→EN (regra 7): tradução de títulos por substituição
// de termos inteiros, case-insensitive, priorizando termos multi-palavra
// (longest-first) e preservando o restante do texto.
const glossaryPath = join(
  dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'config', 'glossario-pt-en.json');

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface Compiled { re: RegExp; map: Map<string, string> }

let compiled: Compiled | null = null;

function load(): Compiled {
  if (compiled) return compiled;
  const raw: Record<string, string> = JSON.parse(readFileSync(glossaryPath, 'utf-8'));
  const map = new Map<string, string>();
  for (const [pt, en] of Object.entries(raw)) map.set(pt.toLowerCase(), en);
  // Alternação única ordenada por tamanho (desc): 'nota fiscal' casa antes de
  // termos curtos e o texto já traduzido não é reprocessado (passada única).
  const alternation = [...map.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join('|');
  // \b não funciona com acentos → lookarounds Unicode para palavra inteira.
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternation})(?![\\p{L}\\p{N}])`, 'giu');
  compiled = { re, map };
  return compiled;
}

/** Traduz um título PT→EN termo a termo; texto sem termo do glossário fica intacto. */
export function translateTitle(pt: string): string {
  if (!pt) return '';
  const { re, map } = load();
  return pt.replace(re, (match) => {
    const en = map.get(match.toLowerCase()) ?? match;
    // Preserva inicial maiúscula do termo original ('Erro' → 'Error').
    return /^\p{Lu}/u.test(match) ? en.charAt(0).toUpperCase() + en.slice(1) : en;
  });
}
