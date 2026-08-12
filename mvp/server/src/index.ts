import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'mvp-server' });
});

app.get('/', (_req, res) => {
  res.json({ message: 'Informed News MVP server' });
});

app.listen(port, () => {
  console.log(`MVP server listening on http://localhost:${port}`);
});
