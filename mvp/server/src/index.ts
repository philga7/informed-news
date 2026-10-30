import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { RequestHandler } from 'express';
import { createApp } from './app.js';
import { REFRESH_CHECK_MINUTES } from './services/briefConfig.js';
import { startRefreshScheduler } from './services/index.js';
import { kiteHandlerPath } from './serveKite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = process.env.MVP_ENV_FILE?.trim() || path.resolve(__dirname, '../../.env');
dotenv.config({ path: envFile, override: true });

const port = Number(process.env.PORT) || 3001;

async function loadKiteHandler(): Promise<RequestHandler | undefined> {
  const handlerPath = kiteHandlerPath(process.env);
  if (!handlerPath) return undefined;
  try {
    const mod = await import(pathToFileURL(handlerPath).href);
    return mod.handler;
  } catch (err) {
    console.error(`Failed to load Kite handler at ${handlerPath}:`, err);
    process.exit(1);
  }
}

const kiteHandler = await loadKiteHandler();

const app = createApp({ kiteHandler });

app.listen(port, '0.0.0.0', () => {
  console.log(`MVP server listening on http://localhost:${port}`);
  const scheduler = startRefreshScheduler();
  console.log(
    scheduler.enabled
      ? `Auto-refresh every ${scheduler.intervalHours}h (checked every ${REFRESH_CHECK_MINUTES} min)`
      : 'Auto-refresh disabled (REFRESH_INTERVAL_HOURS); manual refresh still works',
  );
});
