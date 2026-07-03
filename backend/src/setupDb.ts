import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getClient } from './clickhouse.js';

const sqlPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'sql', 'setup.sql');
const statements = readFileSync(sqlPath, 'utf-8')
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const client = getClient();
for (const stmt of statements) {
  await client.command({ query: stmt });
  console.log('OK:', stmt.split('\n')[0]);
}
await client.close();
console.log('Setup concluído.');
