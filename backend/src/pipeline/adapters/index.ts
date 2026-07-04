import { canonico } from './canonico.js';
import { wrikeExport } from './wrikeExport.js';
import { loop } from './loop.js';
import { estoqueDaily } from './estoqueDaily.js';
import type { SourceAdapter } from './shared.js';

// Ordem importa: o primeiro cujo matches() aceitar o cabeçalho é usado.
export const ADAPTERS: SourceAdapter[] = [canonico, wrikeExport, loop, estoqueDaily];
