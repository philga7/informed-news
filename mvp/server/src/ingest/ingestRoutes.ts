import { createHash, timingSafeEqual } from 'node:crypto';
import express, { Router, type ErrorRequestHandler, type Request, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import { readIngested } from '../store/postgres/ingestStore.js';
import { DashboardStoreError, pgErrorCode } from '../store/postgres/storeSupport.js';
import type { IngestConfig } from './openIngest.js';
import { IngestInputError, LIMITS, isIngestKind, parseItem, type ParsedItem } from './parse.js';

/**
 * The ingest contract (NEWS-228): one authenticated route for everything
 * Grok Bot posts, and a read-back. Mounted at /api/ingest ahead of the JSON
 * parser and the session guard: a bot signs in with its token, never a
 * session. The contract is documented in docs/INGEST.md.
 */

type Logger = (message: string) => void;

type ItemResult = {
  index?: number;
  kind?: string;
  id?: string;
  status: number;
  outcome?: string;
  error?: string;
  reason?: string;
};

const STATUS_BY_REASON = { invalid: 422, missing: 422, conflict: 409 } as const;

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function bearer(req: Request): string | null {
  const header = req.get('authorization') ?? '';
  const match = /^Bearer (\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

/** Errors that mean the database cannot be reached, not that the post is wrong. */
function unreachable(error: unknown): boolean {
  const code = pgErrorCode(error);
  if (code !== null && /^(08|57P)/.test(code)) return true;
  if (code === '53300') return true;
  if (code !== null && /^(ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EHOSTUNREACH)$/.test(code)) return true;
  const message = error instanceof Error ? error.message : '';
  return /^(timeout exceeded when trying to connect|Connection terminated)/i.test(message);
}

function failure(error: unknown, warn: Logger, what: string): ItemResult {
  if (error instanceof IngestInputError) {
    return { status: 422, error: error.message, reason: 'invalid' };
  }
  if (error instanceof DashboardStoreError) {
    return { status: STATUS_BY_REASON[error.reason], error: error.message, reason: error.reason };
  }
  if (unreachable(error)) {
    warn(`Ingest: database unreachable during ${what}`);
    return { status: 503, error: 'the database cannot be reached; retry later', reason: 'unavailable' };
  }
  // Log only what the error is, never its text: a driver message can carry values.
  const name = error instanceof Error ? error.name : typeof error;
  warn(`Ingest: unexpected ${name} (${pgErrorCode(error) ?? 'no code'}) during ${what}`);
  return { status: 500, error: 'the item could not be stored', reason: 'error' };
}

/** The kind and id of a raw item, when they are readable, for its result. */
function namesOf(value: unknown): { kind?: string; id?: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const { kind, id, day } = value as { kind?: unknown; id?: unknown; day?: unknown };
  const named: { kind?: string; id?: string } = {};
  if (typeof kind === 'string') named.kind = kind;
  if (typeof id === 'string') named.id = id;
  else if (kind === 'cfp_day_note' && typeof day === 'string') named.id = day;
  return named;
}

function parseOrFail(value: unknown, warn: Logger): ParsedItem | ItemResult {
  try {
    return parseItem(value);
  } catch (error) {
    return { ...namesOf(value), ...failure(error, warn, 'parse') };
  }
}

async function runParsed(pool: Pool, parsed: ParsedItem | ItemResult, warn: Logger): Promise<ItemResult> {
  if (!('put' in parsed)) return parsed;
  const named = { kind: parsed.kind, id: parsed.id };
  try {
    const result = await parsed.put(pool);
    return { ...named, id: result.id, status: result.outcome === 'created' ? 201 : 200, outcome: result.outcome };
  } catch (error) {
    return { ...named, ...failure(error, warn, `${parsed.kind} put`) };
  }
}

export function createIngestRouter(
  config: IngestConfig | undefined,
  options: { warn?: Logger } = {},
): Router {
  const warn = options.warn ?? ((message) => console.error(message));
  const router = Router();
  const expected = config?.token ? digest(config.token) : null;

  const guard: RequestHandler = (req, res, next) => {
    if (expected === null) {
      res.status(503).json({ error: 'ingest is not configured (INGEST_TOKEN)', reason: 'unavailable' });
      return;
    }
    const given = bearer(req);
    if (given === null || !timingSafeEqual(digest(given), expected)) {
      res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'a valid ingest token is required' });
      return;
    }
    if (!config?.pool) {
      res.status(503).json({ error: 'ingest has no database configured', reason: 'unavailable' });
      return;
    }
    next();
  };

  const schemaReady: RequestHandler = (_req, res, next) => {
    config?.ready().then(
      () => next(),
      (error: unknown) => {
        warn(`Ingest: the dashboard schema is not ready (${pgErrorCode(error) ?? 'no code'})`);
        res.status(503).json({ error: 'the database cannot be reached; retry later', reason: 'unavailable' });
      },
    );
  };

  // The token is checked before the body is read, so an unauthenticated caller
  // cannot make the server parse a large body.
  router.use(guard);
  router.use(express.json({ limit: '1mb' }));
  router.use(schemaReady);

  router.post('/', async (req, res) => {
    const pool = config?.pool as Pool;
    const body: unknown = req.body;
    const batch =
      typeof body === 'object' && body !== null && !Array.isArray(body) && 'items' in body
        ? (body as { items: unknown }).items
        : undefined;
    if (batch === undefined) {
      const result = await runParsed(pool, parseOrFail(body, warn), warn);
      const { status, ...rest } = result;
      res.status(status).json(rest);
      return;
    }
    if (!Array.isArray(batch) || batch.length === 0 || batch.length > LIMITS.batch) {
      res.status(422).json({ error: `items must be a list of 1 to ${LIMITS.batch} items`, reason: 'invalid' });
      return;
    }
    const parsed = batch.map((item) => parseOrFail(item, warn));
    const rows = parsed.reduce((sum, item) => sum + ('rows' in item ? item.rows : 0), 0);
    if (rows > LIMITS.requestRows) {
      res.status(422).json({
        error: `a request may write up to ${LIMITS.requestRows} rows, nested rows included; send a smaller batch`,
        reason: 'invalid',
      });
      return;
    }
    // In order, each in its own transaction: an entry can follow its story in one batch.
    const results: ItemResult[] = [];
    for (const [index, item] of parsed.entries()) {
      results.push({ index, ...(await runParsed(pool, item, warn)) });
    }
    res.status(200).json({ results });
  });

  router.get('/:kind/:id', async (req, res) => {
    const { kind, id } = req.params;
    if (!isIngestKind(kind)) {
      res.status(404).json({ error: 'unknown kind' });
      return;
    }
    try {
      const found = await readIngested(config?.pool as Pool, kind, id ?? '');
      if (found === null) {
        res.status(404).json({ error: `no ${kind} with this id` });
        return;
      }
      res.json({ kind, item: found });
    } catch (error) {
      const { status, ...rest } = failure(error, warn, `${kind} read`);
      res.status(status).json(rest);
    }
  });

  router.use((_req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  const bodyErrors: ErrorRequestHandler = (error, _req, res, next) => {
    const type = (error as { type?: string }).type;
    if (type === 'entity.too.large') {
      res.status(413).json({ error: 'the body is larger than 1 MB; send a smaller batch', reason: 'invalid' });
      return;
    }
    if (type === 'entity.parse.failed') {
      res.status(400).json({ error: 'the body is not valid JSON', reason: 'invalid' });
      return;
    }
    // Any other body error (charset, encoding, an aborted request): a fixed
    // message with its own status, never Express's default page or a stack.
    const status = (error as { status?: unknown }).status;
    if (typeof type === 'string' || (typeof status === 'number' && status >= 400 && status < 500)) {
      res
        .status(typeof status === 'number' && status >= 400 && status < 500 ? status : 400)
        .json({ error: 'the body could not be read', reason: 'invalid' });
      return;
    }
    warn(`Ingest: unexpected ${error instanceof Error ? error.name : typeof error} while reading a request`);
    res.status(500).json({ error: 'the request could not be handled', reason: 'error' });
    void next;
  };
  router.use(bodyErrors);
  return router;
}
