import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parsePublishedHosts } from './compose-bind.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function composeWithPort(portEntry) {
	return `
services:
  app:
    ports:
      - "${portEntry}"
`;
}

describe('NEWS-111 compose published ports bind to loopback only', () => {
	it('accepts loopback host bindings', () => {
		assert.deepEqual(parsePublishedHosts(composeWithPort('127.0.0.1:3001:3001')), ['127.0.0.1']);
		assert.deepEqual(parsePublishedHosts(composeWithPort('127.0.0.1:${INFORMED_NEWS_PORT:-3001}:3001')), [
			'127.0.0.1',
		]);
	});

	it('rejects publishes that are not bound to 127.0.0.1', () => {
		for (const entry of ['0.0.0.0:3001:3001', '3001:3001', '3001']) {
			assert.throws(() => parsePublishedHosts(composeWithPort(entry)), (err) => {
				assert.match(String(err.message), new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
				return true;
			});
		}
	});

	it('rejects a non-loopback explicit host', () => {
		const entry = '192.168.1.5:3001:3001';
		assert.throws(() => parsePublishedHosts(composeWithPort(entry)), (err) => {
			assert.match(String(err.message), /192\.168\.1\.5:3001:3001/);
			return true;
		});
	});

	it('requires every published port in compose.yaml to use 127.0.0.1', () => {
		const hosts = parsePublishedHosts(readFileSync(join(root, 'compose.yaml'), 'utf8'));
		assert.ok(hosts.length > 0, 'expected at least one published port');
		for (const host of hosts) {
			assert.equal(host, '127.0.0.1');
		}
	});
});
