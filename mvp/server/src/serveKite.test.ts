import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import { kiteHandlerPath } from './serveKite.js';

test('kiteHandlerPath returns null when KITE_BUILD_DIR is unset, empty, or whitespace', () => {
  assert.equal(kiteHandlerPath({}), null);
  assert.equal(kiteHandlerPath({ KITE_BUILD_DIR: '' }), null);
  assert.equal(kiteHandlerPath({ KITE_BUILD_DIR: '   ' }), null);
});

test('kiteHandlerPath joins KITE_BUILD_DIR with handler.js', () => {
  const result = kiteHandlerPath({ KITE_BUILD_DIR: '/app/apps/kite/build' });
  assert.equal(result, path.join('/app/apps/kite/build', 'handler.js'));
});
