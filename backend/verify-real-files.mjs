// Verificação local com as planilhas reais (git-ignoradas). NÃO comitar.
// Uso: npx tsx verify-real-files.mjs
import { readFileSync } from 'node:fs';
import { parseSpreadsheet } from './src/pipeline/parser.ts';

const base = 'C:/Users/Wagner/OneDrive/Pessoal/Documentos/Projetos/Tickets/personaladmin/importfiles/';
const files = [
  ['wrike', '2026_07_04_Ituran_ Contrato Squad (exportar).xlsx', (a) => a >= 25],
  ['loop', '2026_07_04_Follow up 1.xlsx', (a) => a > 100],
  ['estoque', '2026_07_04_Daily - ERP Estoque e SIMCARD.xlsx', (a) => a >= 28],
];

let fail = false;
for (const [label, name, ok] of files) {
  const { rows, rejected } = parseSpreadsheet(readFileSync(base + name));
  const pass = ok(rows.length);
  fail ||= !pass;
  console.log(`=== ${label} (${name}) ${pass ? 'OK' : 'FALHOU'}`);
  console.log(`accepted: ${rows.length}, rejected: ${rejected.length}`);
  if (rejected.length) console.log('rejections:', JSON.stringify(rejected));
  console.log('first row:', JSON.stringify(rows[0], null, 1));
}
process.exit(fail ? 1 : 0);
