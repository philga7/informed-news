import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { CitationCheckItem } from '../../types/citationGuard.js';
import { putCitationCourtCacheEntries } from '../../store/citationCourtCacheStore.js';
import { lookupCourtCitations, type CourtFetch } from './courtListenerClient.js';

const TOKEN = 'test-token-do-not-log';
const NOW = new Date('2026-10-27T12:00:00.000Z');
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/courtListener/${name}`, import.meta.url), 'utf8'));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const OBER: CitationCheckItem = { kind: 'court', citation: '576 U.S. 644' };
const BAD: CitationCheckItem = { kind: 'court', citation: '1 U.S. 200' };

type Call = { url: string; init: RequestInit };

async function withCache<T>(fn: (cachePath: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'court-client-'));
  try {
    return await fn(path.join(dir, 'cache.json'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function base(cachePath: string, fetchImpl: CourtFetch, extra: Record<string, unknown> = {}) {
  return { runId: 'run-1', articleId: 'a1', now: NOW, token: TOKEN, fetchImpl, cachePath, ...extra };
}

function captureWarn() {
  const lines: string[] = [];
  const orig = console.warn;
  console.warn = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  return { lines, restore: () => void (console.warn = orig) };
}

test('resolves a reporter cite from the fixture and builds a source record', async () => {
  await withCache(async (cachePath) => {
    const result = await lookupCourtCitations(
      [OBER, BAD],
      base(cachePath, async () => json(fixture('obergefell.json'))),
    );
    const a = result.attachments['576 U.S. 644'];
    assert.equal(a.status, 'resolved');
    assert.equal(a.procedural, false);
    assert.equal(a.text, 'The judgment is affirmed.');
    assert.equal(a.courtRecordUrl, 'https://www.courtlistener.com/opinion/2812209/obergefell-v-hodges/');
    assert.equal(result.attachments['1 U.S. 200'].status, 'unresolved');
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].text, 'The judgment is affirmed.');
    assert.equal(result.sources[0].url, 'https://www.courtlistener.com/opinion/2812209/obergefell-v-hodges/');
    assert.equal(result.sources[0].runId, 'run-1');
    assert.equal(result.sources[0].procedural, false);
  });
});

test('one POST for several cites, Token header, and the second call uses the cache', async () => {
  await withCache(async (cachePath) => {
    const calls: Call[] = [];
    const fetchImpl: CourtFetch = async (url, init) => {
      calls.push({ url, init });
      return json(fixture('obergefell.json'));
    };
    await lookupCourtCitations([OBER, BAD], base(cachePath, fetchImpl));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://www.courtlistener.com/api/rest/v4/citation-lookup/');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, `Token ${TOKEN}`);
    const body = new URLSearchParams(String(calls[0].init.body));
    assert.equal(body.get('text'), '576 U.S. 644\n1 U.S. 200');

    const again = await lookupCourtCitations([OBER, BAD], base(cachePath, fetchImpl));
    assert.equal(calls.length, 1);
    assert.equal(again.attachments['576 U.S. 644'].status, 'resolved');
    assert.equal(again.attachments['1 U.S. 200'].status, 'unresolved');
  });
});

test('HTTP 429 with wait_until sleeps once then retries', async () => {
  await withCache(async (cachePath) => {
    let n = 0;
    const sleeps: number[] = [];
    const fetchImpl: CourtFetch = async () =>
      ++n === 1
        ? json({ wait_until: new Date(NOW.getTime() + 2000).toISOString() }, 429)
        : json(fixture('obergefell.json'));
    const result = await lookupCourtCitations(
      [OBER],
      base(cachePath, fetchImpl, { sleep: async (ms: number) => void sleeps.push(ms) }),
    );
    assert.equal(n, 2);
    assert.deepEqual(sleeps, [2000]);
    assert.equal(result.attachments['576 U.S. 644'].status, 'resolved');
  });
});

test('HTTP 429 after the one backoff is unresolved and not cached', async () => {
  await withCache(async (cachePath) => {
    let n = 0;
    const fetchImpl: CourtFetch = async () => {
      n += 1;
      return json({ wait_until: new Date(NOW.getTime() + 1000).toISOString() }, 429);
    };
    const opts = base(cachePath, fetchImpl, { sleep: async () => {} });
    const r = await lookupCourtCitations([OBER], opts);
    assert.equal(n, 2);
    assert.equal(r.attachments['576 U.S. 644'].status, 'unresolved');
    await lookupCourtCitations([OBER], opts);
    assert.equal(n, 4);
  });
});

test('a timeout / abort is unresolved and warns', async () => {
  await withCache(async (cachePath) => {
    const warn = captureWarn();
    try {
      const fetchImpl: CourtFetch = async () => {
        throw new DOMException('aborted', 'AbortError');
      };
      const r = await lookupCourtCitations([OBER], base(cachePath, fetchImpl));
      assert.equal(r.attachments['576 U.S. 644'].status, 'unresolved');
      assert.ok(warn.lines.length > 0);
    } finally {
      warn.restore();
    }
  });
});

test('no token means no fetch and every court item unresolved', async () => {
  await withCache(async (cachePath) => {
    for (const token of [null, '']) {
      let called = false;
      const r = await lookupCourtCitations(
        [OBER, { kind: 'court', url: 'https://www.courtlistener.com/docket/67590963/x/' }],
        base(cachePath, async () => {
          called = true;
          return json([]);
        }, { token }),
      );
      assert.equal(called, false);
      assert.equal(Object.keys(r.attachments).length, 2);
      assert.ok(Object.values(r.attachments).every((a) => a.status === 'unresolved'));
      assert.deepEqual(r.sources, []);
    }
  });
});

test('the token never reaches console.warn', async () => {
  await withCache(async (cachePath) => {
    const warn = captureWarn();
    try {
      const fetchImpl: CourtFetch = async () => {
        throw new Error(`boom Token ${TOKEN} leaked`);
      };
      await lookupCourtCitations([OBER], base(cachePath, fetchImpl));
      assert.ok(warn.lines.length > 0);
      assert.ok(warn.lines.every((l) => !l.includes(TOKEN)));
    } finally {
      warn.restore();
    }
  });
});

test('a docket URL does one GET and is procedural from cause', async () => {
  await withCache(async (cachePath) => {
    const calls: Call[] = [];
    const url = 'https://www.courtlistener.com/docket/67590963/example-v-state/';
    const r = await lookupCourtCitations(
      [{ kind: 'court', url }],
      base(cachePath, async (u, init) => {
        calls.push({ url: u, init });
        return json(fixture('docket-67590963.json'));
      }),
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://www.courtlistener.com/api/rest/v4/dockets/67590963/');
    assert.equal(calls[0].init.method ?? 'GET', 'GET');
    const a = r.attachments[url];
    assert.equal(a.status, 'resolved');
    assert.equal(a.procedural, true);
    assert.equal(a.courtRecordUrl, 'https://www.courtlistener.com/docket/67590963/example-v-state/');
  });
});

test('an opinion URL does not fetch and stays unresolved with no source', async () => {
  await withCache(async (cachePath) => {
    const url = 'https://www.courtlistener.com/opinion/2812209/obergefell-v-hodges/';
    let called = false;
    const r = await lookupCourtCitations(
      [{ kind: 'court', url }],
      base(cachePath, async () => {
        called = true;
        return json({});
      }),
    );
    assert.equal(called, false);
    assert.equal(r.attachments[url].status, 'unresolved');
    assert.equal(r.attachments[url].courtRecordUrl, null);
    assert.equal(r.attachments[url].procedural, false);
    assert.equal(r.attachments[url].text, null);
    assert.deepEqual(r.sources, []);
  });
});

test('procedural cluster marks the item procedural; status 300 resolves', async () => {
  await withCache(async (cachePath) => {
    const body = [
      {
        citation: '10 F.3d 20',
        normalized_citations: ['10 F.3d 20'],
        status: 300,
        clusters: [
          { absolute_url: '/opinion/1/a/', case_name: 'A v. B', syllabus: 'Affirmed.' },
          { absolute_url: '/opinion/2/c/', case_name: 'C v. D', syllabus: 'Dismissed for lack of standing.' },
        ],
      },
    ];
    const r = await lookupCourtCitations(
      [{ kind: 'court', citation: '10 F.3d 20' }],
      base(cachePath, async () => json(body)),
    );
    const a = r.attachments['10 F.3d 20'];
    assert.equal(a.status, 'resolved');
    assert.equal(a.procedural, true);
    assert.equal(a.courtRecordUrl, 'https://www.courtlistener.com/opinion/1/a/');
  });
});

test('a cache entry older than 7 days is not reused', async () => {
  await withCache(async (cachePath) => {
    await putCitationCourtCacheEntries(
      [
        {
          key: '576 U.S. 644',
          fetchedAt: new Date(NOW.getTime() - 8 * 86_400_000).toISOString(),
          hit: { url: 'https://stale', text: 'stale', procedural: false },
        },
      ],
      cachePath,
    );
    let n = 0;
    const r = await lookupCourtCitations(
      [OBER],
      base(cachePath, async () => {
        n += 1;
        return json(fixture('obergefell.json'));
      }),
    );
    assert.equal(n, 1);
    assert.equal(r.attachments['576 U.S. 644'].text, 'The judgment is affirmed.');
  });
});

test('the cache file never contains the token', async () => {
  await withCache(async (cachePath) => {
    await lookupCourtCitations([OBER], base(cachePath, async () => json(fixture('obergefell.json'))));
    assert.ok(!readFileSync(cachePath, 'utf8').includes(TOKEN));
  });
});

test('a response whose body never arrives times out as unresolved', async () => {
  await withCache(async (cachePath) => {
    const warn = captureWarn();
    try {
      const fetchImpl: CourtFetch = async () =>
        new Response(new ReadableStream({ start() {} }), { status: 200 });
      const r = await lookupCourtCitations([OBER], base(cachePath, fetchImpl, { timeoutMs: 50 }));
      assert.equal(r.attachments['576 U.S. 644'].status, 'unresolved');
      assert.ok(warn.lines.length > 0);
    } finally {
      warn.restore();
    }
  });
});
