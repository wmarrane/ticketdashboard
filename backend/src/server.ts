import { createApp } from './app.js';
import { config } from './config.js';
import { runLoad } from './pipeline/loader.js';
import { queryGold, listUploads } from './routes/dashboard.js';

const app = createApp({ runLoad, queryGold, listUploads });
app.listen(config.port, () => console.log(`Backend na porta ${config.port}`));
