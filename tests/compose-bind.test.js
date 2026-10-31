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

	it('fails closed on unrecognized ports lines in a second service', () => {
		const good = '      - "127.0.0.1:3001:3001"\n';
		const wrap = (ports) => `services:\n  app:\n    ports:\n${good}  other:\n    ports:\n${ports}`;
		const bad = {
			'trailing comment': '      - "9000:9000" # public\n',
			'trailing comment unquoted': '      - 0.0.0.0:9000:9000 # public\n',
			'long syntax': '      - target: 9000\n        published: 9000\n',
			'host prefix only': '      - "127.0.0.10:9000:9000"\n',
		};
		for (const [name, ports] of Object.entries(bad)) {
			assert.throws(() => parsePublishedHosts(wrap(ports)), undefined, name);
		}
		assert.throws(() => parsePublishedHosts(`services:\n  o:\n    ports: ["9000:9000"]\n`));
		assert.throws(() => parsePublishedHosts(`services:\n  o:\n    ports: [\n      "9000:9000"\n    ]\n`));
		assert.deepEqual(parsePublishedHosts(wrap('      - "127.0.0.1:9000:9000" # ok\n')), ['127.0.0.1', '127.0.0.1']);
	});
});
