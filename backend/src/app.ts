import express, { type Express } from 'express';
import multer, { MulterError } from 'multer';
import { parseSpreadsheet, UnknownLayoutError, type ParseResult } from './pipeline/parser.js';
import { buildWorkbook } from './export/excelExport.js';
import type { ExportData } from './export/exportData.js';
import {
  buildDashboardReport, buildOpenTicketsReport,
  type DashboardData, type OpenTicketRow, type ReportLang,
} from './report/htmlReport.js';

export interface Deps {
  runLoad: (source: string, fileName: string, parsed: ParseResult)
    => Promise<{ loadId: string; rowsAccepted: number; rowsRejected: number }>;
  queryGold: () => Promise<unknown>;
  listUploads: () => Promise<unknown[]>;
  fetchExportData: () => Promise<ExportData>;
  fetchOpenTickets: () => Promise<OpenTicketRow[]>;
}

function exportFileName(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}_${pad(d.getMonth() + 1)}_${pad(d.getDate())}_Cards_Ituran_Contrato_Squad.xlsx`;
}

function datePrefix(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}_${pad(d.getMonth() + 1)}_${pad(d.getDate())}`;
}

function parseLang(raw: unknown): ReportLang | null {
  if (raw === undefined || raw === 'pt') return 'pt';
  if (raw === 'en') return 'en';
  return null;
}

function sendHtmlReport(res: express.Response, html: string, fileName: string): void {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(html);
}

const SOURCES = new Set(['wrike', 'loop', 'office365']);
const EXTENSIONS = /\.(xlsx|csv)$/i;

export function createApp(deps: Deps): Express {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

  app.post('/api/upload', upload.single('file'), async (req, res) => {
    const source = String(req.body?.source ?? '');
    if (!SOURCES.has(source)) return res.status(400).json({ error: 'Fonte inválida. Use wrike, loop ou office365.' });
    if (!req.file) return res.status(400).json({ error: 'Arquivo ausente.' });
    if (!EXTENSIONS.test(req.file.originalname)) return res.status(400).json({ error: 'Extensão não suportada. Use .xlsx ou .csv.' });
    try {
      const parsed = parseSpreadsheet(req.file.buffer);
      if (parsed.rows.length === 0) {
        return res.status(400).json({ error: 'Planilha sem linhas válidas.', rejected: parsed.rejected });
      }
      const result = await deps.runLoad(source, req.file.originalname, parsed);
      res.json({ ...result, rejected: parsed.rejected });
    } catch (err) {
      if (err instanceof UnknownLayoutError) {
        return res.status(400).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: 'Erro interno.' });
    }
  });

  app.get('/api/dashboard', async (_req, res) => {
    try { res.json(await deps.queryGold()); }
    catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno.' }); }
  });

  app.get('/api/uploads', async (_req, res) => {
    try { res.json(await deps.listUploads()); }
    catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno.' }); }
  });

  app.get('/api/export', async (_req, res) => {
    try {
      const data = await deps.fetchExportData();
      const buffer = await buildWorkbook(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${exportFileName(data.generatedAt)}"`);
      res.send(buffer);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno.' }); }
  });

  app.get('/api/report/dashboard', async (req, res) => {
    const lang = parseLang(req.query.lang);
    if (!lang) return res.status(400).json({ error: 'Idioma inválido. Use pt ou en.' });
    try {
      const data = await deps.queryGold() as DashboardData;
      const now = new Date();
      sendHtmlReport(res, buildDashboardReport(data, lang, now), `${datePrefix(now)}_dashboard_${lang}.html`);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno.' }); }
  });

  app.get('/api/report/open-tickets', async (req, res) => {
    const lang = parseLang(req.query.lang);
    if (!lang) return res.status(400).json({ error: 'Idioma inválido. Use pt ou en.' });
    try {
      const rows = await deps.fetchOpenTickets();
      const now = new Date();
      const base = lang === 'pt' ? 'tickets_abertos' : 'open_tickets';
      sendHtmlReport(res, buildOpenTicketsReport(rows, lang, now), `${datePrefix(now)}_${base}_${lang}.html`);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno.' }); }
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof MulterError) return res.status(400).json({ error: `Upload inválido: ${err.message}` });
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  });

  return app;
}
