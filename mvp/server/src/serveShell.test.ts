import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import { shellHandlerPath, shellOwnsPath } from './serveShell.js';

test('shellOwnsPath is true for /shell and paths under /shell/', () => {
  assert.equal(shellOwnsPath('/shell'), true);
  assert.equal(shellOwnsPath('/shell/'), true);
  assert.equal(shellOwnsPath('/shell/deep'), true);
  assert.equal(shellOwnsPath('/shell/missing'), true);
});

test('shellOwnsPath is false for the home page, lookalikes, and non-shell routes', () => {
  const notOwned = [
    '',
    '/',
    '/shellish',
    '/topics',
    '/api',
    '/healthz',
    '/map',
    '/signals',
    '/finance',
    '/situation',
    '/listen',
    '/desk',
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
