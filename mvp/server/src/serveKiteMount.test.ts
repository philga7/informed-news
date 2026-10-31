import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { test } from 'node:test';
import type { RequestHandler } from 'express';

import { createApp } from './app.js';
import type { RefreshRunner } from './services/refreshRunner.js';

async function startServer(app: { listen: (...args: any[]) => Server }): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object' && typeof address.port === 'number');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    close: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function makeRefreshRunner(): RefreshRunner {
  return {
    isRunning: () => false,
    run: async (): Promise<never> => {
      throw new Error('unexpected refresh');
    },
  };
}

test('with kiteHandler: GET / is the handler, GET /healthz stays Express, POST /api/fetch stays 401 and is not forwarded', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  let kiteRequestCount = 0;
  let fetchRequestCount = 0;
  const kiteHandler: RequestHandler = (req, res) => {
    kiteRequestCount += 1;
    if (req.path === '/api/fetch') {
      fetchRequestCount += 1;
    }
    res.status(200).send('kite-page');
  };

  const app = createApp({ refreshRunner: makeRefreshRunner(), kiteHandler });
  const { baseUrl, close } = await startServer(app);

  try {
    const root = await fetch(`${baseUrl}/`);
    assert.equal(root.status, 200);
    assert.equal(await root.text(), 'kite-page');
    assert.equal(kiteRequestCount, 1);

    const healthz = await fetch(`${baseUrl}/healthz`);
    assert.equal(healthz.status, 200);
    assert.deepEqual(await healthz.json(), { status: 'ok' });

    const fetchResp = await fetch(`${baseUrl}/api/fetch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(fetchResp.status, 401);
    assert.equal(fetchRequestCount, 0, 'kiteHandler must not see /api/fetch; Express answered');
  } finally {
    await close();
  }
});

test('without kiteHandler: GET / stays the JSON message', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const app = createApp({ refreshRunner: makeRefreshRunner() });
  const { baseUrl, close } = await startServer(app);

  try {
    const root = await fetch(`${baseUrl}/`);
    assert.equal(root.status, 200);
    assert.deepEqual(await root.json(), { message: 'Informed News MVP server' });

    const fetchResp = await fetch(`${baseUrl}/api/fetch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(fetchResp.status, 401);
  } finally {
    await close();
  }
});
