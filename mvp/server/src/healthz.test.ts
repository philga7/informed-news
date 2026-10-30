import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Server } from 'node:http';

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

test('GET /healthz is 200 with no session and no outside calls', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const realFetch = globalThis.fetch;
  let fetchCalls = 0;
  let runCalls = 0;

  globalThis.fetch = (async (..._args: Parameters<typeof fetch>) => {
    fetchCalls += 1;
    throw new Error('unexpected fetch');
  }) as typeof fetch;

  const refreshRunner: RefreshRunner = {
    isRunning: () => false,
    run: async (): Promise<never> => {
      runCalls += 1;
      throw new Error('unexpected refresh');
    },
  };

  const app = createApp({ refreshRunner });
  const { baseUrl, close } = await startServer(app);

  try {
    const healthz = await realFetch(`${baseUrl}/healthz`);
    assert.equal(healthz.status, 200);
    assert.deepEqual(await healthz.json(), { status: 'ok' });
    assert.equal(fetchCalls, 0);
    assert.equal(runCalls, 0);

    const fetchResp = await realFetch(`${baseUrl}/api/fetch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(fetchResp.status, 401);
    assert.equal(fetchCalls, 0);
    assert.equal(runCalls, 0);

    const health = await realFetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
  } finally {
    globalThis.fetch = realFetch;
    await close();
  }
});
