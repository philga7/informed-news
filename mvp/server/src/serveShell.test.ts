import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import { shellHandlerPath, shellOwnsPath } from './serveShell.js';

test('shellOwnsPath is true for Brief, /shell, and /latest paths', () => {
  const owned = [
    '/',
    '/shell',
    '/shell/',
    '/shell/deep',
    '/latest',
    '/latest/world',
    '/latest/world/1',
  ];
  for (const pathname of owned) {
    assert.equal(shellOwnsPath(pathname), true, pathname);
  }
});

test('shellOwnsPath is false for lookalikes and non-shell routes', () => {
  const notOwned = [
    '',
    '/shellish',
    '/latestish',
    '/topics',
    '/transparency',
    '/filtered',
    '/feedback',
    '/contribute',
    '/radar',
    '/api',
    '/healthz',
    '/map',
    '/signals',
    '/finance',
    '/situation',
    '/listen',
    '/desk',
    '/2026-09-30/world',
    '/api/fetch',
  ];
  for (const pathname of notOwned) {
    assert.equal(shellOwnsPath(pathname), false, pathname);
  }
});

test('shellHandlerPath returns null when WEB_BUILD_DIR is unset, empty, or whitespace', () => {
  assert.equal(shellHandlerPath({}), null);
  assert.equal(shellHandlerPath({ WEB_BUILD_DIR: '' }), null);
  assert.equal(shellHandlerPath({ WEB_BUILD_DIR: '   ' }), null);
});

test('shellHandlerPath joins WEB_BUILD_DIR with handler.js', () => {
  const result = shellHandlerPath({ WEB_BUILD_DIR: '/app/apps/web/build' });
  assert.equal(result, path.join('/app/apps/web/build', 'handler.js'));
});
