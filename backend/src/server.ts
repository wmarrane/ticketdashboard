import { createApp } from './app.js';
import { config } from './config.js';
import { runLoad } from './pipeline/loader.js';
import { queryGold, listUploads } from './routes/dashboard.js';
import { fetchExportData } from './export/exportData.js';
import { fetchOpenTickets } from './report/reportData.js';

const app = createApp({ runLoad, queryGold, listUploads, fetchExportData, fetchOpenTickets });
app.listen(config.port, () => console.log(`Backend na porta ${config.port}`));
