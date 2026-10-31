import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "mvp/server/src");
const examplePath = join(root, "mvp/.env.example");

const IGNORED = new Set(["NODE_ENV", "NODE_TEST_CONTEXT"]);
const ALLOWED_VALUES = [
  /^$/,
  /^change-me/,
  /^(true|false|off|no|0)$/,
  /^\d+$/,
  /^https:\/\/citizenfreepress\.com\/feed\/$/,
  /^http:\/\/searxng:8080$/,
  /^http:\/\/127\.0\.0\.1:8888$/,
  /^(glm-5\.3-flash|jev-1\.13\.0)$/,
];

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

function envNamesInSource() {
  const names = new Set();
  for (const file of sourceFiles(srcDir)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/\b(?:process\.env|env)\.([A-Z][A-Z0-9_]*)\b/g)) {
      names.add(m[1]);
    }
  }
  for (const n of IGNORED) names.delete(n);
  return names;
}

function parseExample() {
  const keys = new Map();
  for (const line of readFileSync(examplePath, "utf8").split("\n")) {
    const m = line.match(/^#?\s*([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) keys.set(m[1], m[2].trim());
  }
  return keys;
}

test("mvp/.env.example lists every env var the server reads", () => {
  const names = envNamesInSource();
  assert.ok(names.size > 10, "expected to find env names in server source");
  const keys = parseExample();
  const missing = [...names].filter((n) => !keys.has(n)).sort();
  assert.deepEqual(missing, []);
});

test("mvp/.env.example holds placeholder values only", () => {
  const bad = [...parseExample()].filter(
    ([, v]) => !ALLOWED_VALUES.some((re) => re.test(v)),
  );
  assert.deepEqual(bad, []);
});

test("mvp/.env.example groups required and optional keys", () => {
  const text = readFileSync(examplePath, "utf8");
  assert.match(text, /^# Required/m);
  assert.match(text, /^# Optional/m);
  assert.ok(text.indexOf("# Required") < text.indexOf("# Optional"));
});
