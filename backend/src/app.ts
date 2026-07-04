import express, { type Express } from 'express';
import multer, { MulterError } from 'multer';
import { parseSpreadsheet, type ParseResult } from './pipeline/parser.js';

export interface Deps {
  runLoad: (source: string, fileName: string, parsed: ParseResult)
    => Promise<{ loadId: string; rowsAccepted: number; rowsRejected: number }>;
  queryGold: () => Promise<unknown>;
  listUploads: () => Promise<unknown[]>;
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

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof MulterError) return res.status(400).json({ error: `Upload inválido: ${err.message}` });
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  });

  return app;
}
