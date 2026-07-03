import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const rulesPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'config', 'area-rules.json');
const rules: Record<string, string[]> = JSON.parse(readFileSync(rulesPath, 'utf-8'));
const ORDER = ['Financeiro', 'Estoque'] as const;

export function classifyArea(taskName: string): 'Financeiro' | 'Estoque' | 'Outros' {
  const name = taskName.toLowerCase();
  for (const area of ORDER) {
    if (rules[area].some((kw) => name.includes(kw.toLowerCase()))) return area;
  }
  return 'Outros';
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function areaRegexSql(): string {
  const branches = ORDER.map((area) => {
    const pattern = rules[area].map((kw) => escapeRegex(kw.toLowerCase())).join('|');
    return `match(lowerUTF8(task_name), '(${pattern})'), '${area}'`;
  });
  return `multiIf(${branches.join(', ')}, 'Outros')`;
}
