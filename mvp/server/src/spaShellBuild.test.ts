import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { RequestHandler } from 'express';

import { createApp } from './app.js';
import type { RefreshRunner } from './services/refreshRunner.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const handlerPath = path.join(repoRoot, 'apps/web/build/handler.js');

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

test('built shell serves /shell and /shell/deep; GET / stays the JSON message', async () => {
  if (!existsSync(handlerPath)) {
    throw new Error('apps/web build is missing; run `bun run build` in apps/web');
  }

  const mod = (await import(pathToFileURL(handlerPath).href)) as { handler: RequestHandler };
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const app = createApp({ refreshRunner: makeRefreshRunner(), shellHandler: mod.handler });
  const { baseUrl, close } = await startServer(app);

  try {
    const shell = await fetch(`${baseUrl}/shell`);
    assert.equal(shell.status, 200);
    const shellHtml = await shell.text();
    assert.match(shellHtml, /Informed News/);
    assert.match(shellHtml, /Brief/);

    const deep = await fetch(`${baseUrl}/shell/deep`);
    assert.equal(deep.status, 200);
    assert.match(await deep.text(), /Shell deep link/);

    const root = await fetch(`${baseUrl}/`);
    assert.equal(root.status, 200);
    assert.deepEqual(await root.json(), { message: 'Informed News MVP server' });
  } finally {
    await close();
  }
});
