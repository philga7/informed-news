import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

const port = Number(process.env.PORT) || 3001;

const app = createApp();

app.listen(port, () => {
  console.log(`MVP server listening on http://localhost:${port}`);
});
