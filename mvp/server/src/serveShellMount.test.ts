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

test('with both handlers: shell paths hit the shell only, other pages hit kite only, Express keeps healthz and /api/fetch', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const shellSeen: string[] = [];
  const kiteSeen: string[] = [];
  let fetchRequestCount = 0;
  const shellHandler: RequestHandler = (req, res) => {
    shellSeen.push(req.path);
    if (req.path === '/api/fetch') {
      fetchRequestCount += 1;
    }
    res.status(200).send('shell-page');
  };
  const kiteHandler: RequestHandler = (req, res) => {
    kiteSeen.push(req.path);
    if (req.path === '/api/fetch') {
      fetchRequestCount += 1;
    }
    res.status(200).send('kite-page');
  };

  const app = createApp({ refreshRunner: makeRefreshRunner(), shellHandler, kiteHandler });
  const { baseUrl, close } = await startServer(app);

  try {
    for (const pathname of ['/shell', '/shell/deep', '/shell/missing']) {
      const response = await fetch(`${baseUrl}${pathname}`);
      assert.equal(response.status, 200, pathname);
      assert.equal(await response.text(), 'shell-page', pathname);
    }

    for (const pathname of ['/', '/topics', '/transparency', '/map', '/signals']) {
      const response = await fetch(`${baseUrl}${pathname}`);
      assert.equal(response.status, 200, pathname);
      assert.equal(await response.text(), 'kite-page', pathname);
    }

    const healthz = await fetch(`${baseUrl}/healthz`);
    assert.equal(healthz.status, 200);
    assert.deepEqual(await healthz.json(), { status: 'ok' });

    const fetchResp = await fetch(`${baseUrl}/api/fetch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(fetchResp.status, 401);
    assert.equal(fetchRequestCount, 0, 'neither handler sees /api/fetch; Express answered');

    assert.deepEqual(shellSeen, ['/shell', '/shell/deep', '/shell/missing']);
    assert.deepEqual(kiteSeen, ['/', '/topics', '/transparency', '/map', '/signals']);
  } finally {
    await close();
  }
});

test('with shell handler and no kite handler: GET / stays the JSON message and GET /shell is the shell', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  let shellRequestCount = 0;
  const shellHandler: RequestHandler = (_req, res) => {
    shellRequestCount += 1;
    res.status(200).send('shell-page');
  };

  const app = createApp({ refreshRunner: makeRefreshRunner(), shellHandler });
  const { baseUrl, close } = await startServer(app);

  try {
    const root = await fetch(`${baseUrl}/`);
    assert.equal(root.status, 200);
    assert.deepEqual(await root.json(), { message: 'Informed News MVP server' });
    assert.equal(shellRequestCount, 0);

    const shell = await fetch(`${baseUrl}/shell`);
    assert.equal(shell.status, 200);
    assert.equal(await shell.text(), 'shell-page');
    assert.equal(shellRequestCount, 1);
  } finally {
    await close();
  }
});

test('shell next() with no error on /shell/missing is 404 and does not reach Kite', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const kiteSeen: string[] = [];
  const shellHandler: RequestHandler = (req, res, next) => {
    if (req.path === '/shell/missing') {
      next();
      return;
    }
    res.status(200).send('shell-page');
  };
  const kiteHandler: RequestHandler = (req, res) => {
    kiteSeen.push(req.path);
    res.status(200).send('kite-page');
  };

  const app = createApp({ refreshRunner: makeRefreshRunner(), shellHandler, kiteHandler });
  const { baseUrl, close } = await startServer(app);

  try {
    const missing = await fetch(`${baseUrl}/shell/missing`);
    assert.equal(missing.status, 404);
    assert.deepEqual(kiteSeen, []);
  } finally {
    await close();
  }
});
