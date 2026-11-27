import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const pkg = JSON.parse(readFileSync(new URL('../mvp/server/package.json', import.meta.url), 'utf8'));

test('`npm run agents` runs compiled JS, so it works where tsx is not installed', () => {
  assert.equal(pkg.scripts.agents, 'node dist/cli/agents.js');
  assert.ok(!/\btsx\b/.test(pkg.scripts.agents));
});

test('`agents:dev` runs the TypeScript source without a build', () => {
  assert.equal(pkg.scripts['agents:dev'], 'tsx src/cli/agents.ts');
});

test('tsx stays a devDependency (the production image omits it)', () => {
  assert.ok(pkg.devDependencies.tsx);
  assert.ok(!pkg.dependencies.tsx);
});
