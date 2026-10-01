import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SUMMARY_MAX_CHARS } from './briefConfig.js';
import { buildSummaryPrompt, parseSummaryOutput, summarizeSource } from './briefSummary.js';

const SOURCE = { title: 'Port reopens', text: 'Port reopens\n\nThe port reopened on Monday, officials said.' };

function stubOllama(content: string, requests: any[] = []) {
  return {
    chat: async (req: any) => {
      requests.push(req);
      return { message: { content } };
    },
  };
}

test('buildSummaryPrompt includes title, text and neutrality rules', () => {
  const prompt = buildSummaryPrompt('Bridge closed', 'Officials closed the bridge on Tuesday.');
  assert.match(prompt, /Bridge closed/);
  assert.match(prompt, /Officials closed the bridge on Tuesday\./);
  assert.match(prompt, /neutral/);
  assert.match(prompt, /ONLY facts stated in the source text/);
  assert.match(prompt, /No speculation/);
  assert.match(prompt, /No evaluative adjectives/);
  assert.match(prompt, /Do not claim that anything is true/);
  assert.match(prompt, /"summary"/);
});

test('parseSummaryOutput reads JSON and normalizes whitespace', () => {
  assert.deepEqual(
    parseSummaryOutput(JSON.stringify({ summary: '  The port   reopened\non Monday, officials said.  ' })),
    { ok: true, text: 'The port reopened on Monday, officials said.' },
  );
});

test('parseSummaryOutput strips wrapping quotes', () => {
  assert.deepEqual(parseSummaryOutput(JSON.stringify({ summary: '"The port reopened on Monday."' })), {
    ok: true,
    text: 'The port reopened on Monday.',
  });
  assert.deepEqual(
    parseSummaryOutput(JSON.stringify({ summary: '\u201cThe port reopened on Monday.\u201d' })),
    { ok: true, text: 'The port reopened on Monday.' },
  );
});

test('parseSummaryOutput keeps the first two sentences', () => {
  const result = parseSummaryOutput(
    JSON.stringify({
      summary: 'The U.S. Navy said the port reopened. Ships resumed docking! Officials expect more traffic. Another line.',
    }),
  );
  assert.deepEqual(result, {
    ok: true,
    text: 'The U.S. Navy said the port reopened. Ships resumed docking!',
  });
});

test('parseSummaryOutput rejects too short and too long summaries', () => {
  const short = parseSummaryOutput(JSON.stringify({ summary: 'Port open.' }));
  assert.equal(short.ok, false);
  if (!short.ok) assert.match(short.error, /too short/);

  const long = parseSummaryOutput(JSON.stringify({ summary: `${'word '.repeat(100)}end.` }));
  assert.ok(`${'word '.repeat(100)}end.`.length > SUMMARY_MAX_CHARS);
  assert.equal(long.ok, false);
  if (!long.ok) assert.match(long.error, /too long/);
});

test('parseSummaryOutput rejects non-JSON and missing summary', () => {
  assert.equal(parseSummaryOutput('The port reopened on Monday.').ok, false);
  assert.equal(parseSummaryOutput(JSON.stringify({ text: 'The port reopened on Monday.' })).ok, false);
  assert.equal(parseSummaryOutput(JSON.stringify(['The port reopened on Monday.'])).ok, false);
});

test('summarizeSource without Ollama returns "Ollama not configured" and makes no call', async () => {
  const result = await summarizeSource(SOURCE, { ollama: null });
  assert.deepEqual(result, { ok: false, error: 'Ollama not configured' });
});

test('summarizeSource makes one JSON-format call and returns the parsed summary', async () => {
  const requests: any[] = [];
  const result = await summarizeSource(SOURCE, {
    model: 'test-model',
    ollama: stubOllama(JSON.stringify({ summary: 'The port reopened on Monday, officials said.' }), requests),
  });
  assert.deepEqual(result, {
    ok: true,
    text: 'The port reopened on Monday, officials said.',
    model: 'test-model',
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].format, 'json');
  assert.equal(requests[0].stream, false);
  assert.equal(requests[0].model, 'test-model');
  assert.match(requests[0].messages[0].content, /The port reopened on Monday, officials said\./);
});

test('summarizeSource never throws on chat failure, bad output, or timeout', async () => {
  const failed = await summarizeSource(SOURCE, {
    model: 'm',
    ollama: {
      chat: async () => {
        throw new Error('boom');
      },
    },
  });
  assert.deepEqual(failed, { ok: false, error: 'boom' });

  const bad = await summarizeSource(SOURCE, { model: 'm', ollama: stubOllama('not json') });
  assert.equal(bad.ok, false);

  const slow = await summarizeSource(SOURCE, {
    model: 'm',
    timeoutMs: 5,
    ollama: { chat: () => new Promise(() => {}) },
  });
  assert.deepEqual(slow, { ok: false, error: 'Ollama API request timed out' });
});
