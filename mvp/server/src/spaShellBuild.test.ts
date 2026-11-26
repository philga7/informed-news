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
    runningSince: () => null,
    run: async (): Promise<never> => {
      throw new Error('unexpected refresh');
    },
  };
}

function titles(html: string): string[] {
  return [...html.matchAll(/<title>([\s\S]*?)<\/title>/gi)].map((match) => match[1].trim());
}

function anchors(html: string): { href: string; text: string }[] {
  const found: { href: string; text: string }[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1] ?? '';
    const hrefMatch = /\bhref\s*=\s*"([^"]*)"/i.exec(attrs);
    const text = (match[2] ?? '').replace(/<[^>]+>/g, '').trim();
    found.push({ href: hrefMatch?.[1] ?? '', text });
  }
  return found;
}

test('built shell serves /shell and /shell/deep; GET / stays the JSON message', async () => {
  if (!existsSync(handlerPath)) {
    throw new Error('apps/web build is missing; run `bun run build` in apps/web');
  }

  const mod = (await import(pathToFileURL(handlerPath).href)) as { handler: RequestHandler };
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const kiteSeen: string[] = [];
  const kiteHandler: RequestHandler = (req, res) => {
    kiteSeen.push(req.path);
    res.status(200).send('kite-page');
  };

  const app = createApp({
    refreshRunner: makeRefreshRunner(),
    shellHandler: mod.handler,
    kiteHandler,
  });
  const { baseUrl, close } = await startServer(app);

  try {
    const shell = await fetch(`${baseUrl}/shell`);
    assert.equal(shell.status, 200);
    const shellHtml = await shell.text();
    assert.ok(shellHtml.includes('informed-news'), 'expected the informed-news brand');
    const shellLinks = anchors(shellHtml);
    assert.ok(
      shellLinks.some((link) => link.href === '/shell' && link.text === 'Home'),
      'expected a Home link to /shell',
    );
    assert.ok(
      shellLinks.some((link) => link.href === '/topics' && link.text === 'Topics'),
      'expected a Topics link to /topics',
    );
    assert.equal(
      shellLinks.some((link) => link.text === 'Brief'),
      false,
      'built /shell has no Brief link',
    );
    assert.equal(
      shellLinks.some((link) => link.href === '/shell/deep' || link.text === 'Deep link'),
      false,
      'built /shell has no /shell/deep link',
    );
    assert.equal(shellHtml.includes('Developing stories'), false);
    assert.equal(shellHtml.includes('>Breaking<'), false);
    assert.deepEqual(titles(shellHtml), ['Informed News']);

    const deep = await fetch(`${baseUrl}/shell/deep`);
    assert.equal(deep.status, 200);
    const deepHtml = await deep.text();
    assert.ok(deepHtml.includes('<h1>Shell deep link</h1>'));
    assert.deepEqual(titles(deepHtml), ['Shell deep link']);

    const missing = await fetch(`${baseUrl}/shell/missing`);
    assert.equal(missing.status, 404);
    await missing.arrayBuffer();
    assert.deepEqual(kiteSeen, []);

    const scriptSrc = [
      ...shellHtml.matchAll(/<script\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi),
      ...shellHtml.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
    ]
      .map((match) => match[1])
      .find((src) => src.includes('/shell/_app/'));
    assert.ok(scriptSrc, 'expected a script URL under /shell/_app/');
    const assetUrl = new URL(scriptSrc, `${baseUrl}/shell`);
    const asset = await fetch(assetUrl);
    assert.equal(asset.status, 200);
    const contentType = asset.headers.get('content-type') ?? '';
    assert.match(contentType, /javascript/i);
    await asset.arrayBuffer();
    assert.deepEqual(kiteSeen, []);
  } finally {
    await close();
  }

  // The JSON home page is registered only when no Kite handler is mounted.
  const jsonApp = createApp({
    refreshRunner: makeRefreshRunner(),
    shellHandler: mod.handler,
  });
  const jsonServer = await startServer(jsonApp);
  try {
    const root = await fetch(`${jsonServer.baseUrl}/`);
    assert.equal(root.status, 200);
    assert.deepEqual(await root.json(), { message: 'Informed News MVP server' });
  } finally {
    await jsonServer.close();
  }
});
