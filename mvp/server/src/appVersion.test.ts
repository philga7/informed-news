import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { readAppVersion } from './appVersion.js';

test('readAppVersion: repo root package.json version', () => {
  const root = path.resolve(import.meta.dirname, '../../..');
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
  };
  assert.equal(pkg.name, 'informed-news');
  assert.equal(readAppVersion(), pkg.version);
});

test('readAppVersion: a nearer package.json with another name is skipped', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'app-version-'));
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'informed-news', version: '9.9.9' }),
  );
  const nearer = path.join(root, 'mvp', 'server');
  mkdirSync(nearer, { recursive: true });
  writeFileSync(
    path.join(nearer, 'package.json'),
    JSON.stringify({ name: 'informed-news-mvp-server', version: '0.0.1' }),
  );

  assert.equal(readAppVersion(nearer), '9.9.9');
});

test('readAppVersion: no matching file returns unknown', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'app-version-none-'));
  const child = path.join(root, 'child');
  mkdirSync(child);
  writeFileSync(path.join(child, 'package.json'), '{');
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'informed-news', version: '' }),
  );

  assert.equal(readAppVersion(child), 'unknown');
  assert.equal(readAppVersion(mkdtempSync(path.join(tmpdir(), 'app-version-empty-'))), 'unknown');
});
