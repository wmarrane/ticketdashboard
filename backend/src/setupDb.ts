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
try {
  for (const stmt of statements) {
    try {
      await client.command({ query: stmt });
      console.log('OK:', stmt.split('\n')[0]);
    } catch (err) {
      console.error('FALHA:', stmt.split('\n')[0]);
      console.error(err);
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await client.close();
}
if (process.exitCode === 1) {
  console.error('Setup interrompido por erro.');
} else {
  console.log('Setup concluído.');
}
