import { canonico } from './canonico.js';
import { wrikeExport } from './wrikeExport.js';
import { loop } from './loop.js';
import { estoqueDaily } from './estoqueDaily.js';
import { oracleCasos } from './oracleCasos.js';
import type { SourceAdapter } from './shared.js';

// Ordem importa: o primeiro cujo matches() aceitar o cabeçalho é usado.
// canonico é checado primeiro; entre os demais, as assinaturas de cabeçalho são
// disjuntas (oracle exige gravidade+número+assunto, exclusivos desse layout).
export const ADAPTERS: SourceAdapter[] = [canonico, wrikeExport, loop, estoqueDaily, oracleCasos];
