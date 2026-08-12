import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to mvp/data (sibling of mvp/server) */
export const DATA_DIR = path.resolve(__dirname, '../../../data');

export const ARTICLES_PATH = path.join(DATA_DIR, 'articles.json');
export const META_PATH = path.join(DATA_DIR, 'meta.json');
