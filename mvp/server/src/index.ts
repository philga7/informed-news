import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { REFRESH_CHECK_MINUTES } from './services/briefConfig.js';
import { startRefreshScheduler } from './services/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = process.env.MVP_ENV_FILE?.trim() || path.resolve(__dirname, '../../.env');
dotenv.config({ path: envFile, override: true });

const port = Number(process.env.PORT) || 3001;

const app = createApp();

app.listen(port, () => {
  console.log(`MVP server listening on http://localhost:${port}`);
  const scheduler = startRefreshScheduler();
  console.log(
    scheduler.enabled
      ? `Auto-refresh every ${scheduler.intervalHours}h (checked every ${REFRESH_CHECK_MINUTES} min)`
      : 'Auto-refresh disabled (REFRESH_INTERVAL_HOURS); manual refresh still works',
  );
});
