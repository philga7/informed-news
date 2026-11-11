import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createAbortableOllamaClient } from './ollamaFraming.js';
import { OLLAMA_TIMEOUT_MESSAGE, onDemandChat } from './onDemandOllama.js';
import { summarizeSource } from './briefSummary.js';
import { enrichFullStory } from './briefFullStoryEnrichment.js';

const OK_BODY = JSON.stringify({
  message: { role: 'assistant', content: JSON.stringify({ summary: 'The port reopened on Monday after a short closure.' }) },
  done: true,
});

type HangLog = { signals: AbortSignal[]; aborted: boolean[] };

/** fetch that hangs until its request signal aborts; records every call. */
function hangingFetch(log: HangLog): typeof fetch {
  return ((_url: unknown, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal;
    const idx = log.signals.push(signal) - 1;
    log.aborted[idx] = false;
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        log.aborted[idx] = true;
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
  }) as unknown as typeof fetch;
}

function okFetch(log: { calls: number }): typeof fetch {
  return (async () => {
    log.calls += 1;
    return new Response(OK_BODY, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
}

async function withKey<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.OLLAMA_API_KEY;
  process.env.OLLAMA_API_KEY = 'test-key';
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.OLLAMA_API_KEY;
    else process.env.OLLAMA_API_KEY = prev;
  }
}

const SOURCE = { title: 'Port reopens', text: 'The port reopened on Monday, officials said.' };
const REQ = { model: 'm', messages: [{ role: 'user', content: 'hi' }], stream: false as const };

test('NEWS-211 createAbortableOllamaClient: aborting the signal aborts the in-flight HTTP request', () =>
  withKey(async () => {
    const log: HangLog = { signals: [], aborted: [] };
    const controller = new AbortController();
    const client = createAbortableOllamaClient(controller.signal, hangingFetch(log));
    assert.ok(client);
    const pending = client.chat({ ...REQ });
    assert.equal(log.signals.length, 1);
    controller.abort();
    await assert.rejects(pending);
    assert.deepEqual(log.aborted, [true]);
  }));

test('NEWS-211 createAbortableOllamaClient returns null without an API key', () => {
  const prev = process.env.OLLAMA_API_KEY;
  delete process.env.OLLAMA_API_KEY;
  try {
    assert.equal(createAbortableOllamaClient(new AbortController().signal), null);
  } finally {
    if (prev !== undefined) process.env.OLLAMA_API_KEY = prev;
  }
});

test('NEWS-211 onDemandChat aborts the HTTP request when the timeout fires', () =>
  withKey(async () => {
    const log: HangLog = { signals: [], aborted: [] };
    const makeClient = (signal: AbortSignal) => createAbortableOllamaClient(signal, hangingFetch(log));
    await assert.rejects(onDemandChat({ ...REQ }, 10, makeClient), new RegExp(OLLAMA_TIMEOUT_MESSAGE));
    assert.deepEqual(log.aborted, [true]);
  }));

test('NEWS-211 on-demand summary: timeout aborts attempt 1; the retry is a fresh client and call that succeeds', () =>
  withKey(async () => {
    const hang: HangLog = { signals: [], aborted: [] };
    const ok = { calls: 0 };
    let clients = 0;
    const makeClient = (signal: AbortSignal) => {
      clients += 1;
      return createAbortableOllamaClient(signal, clients === 1 ? hangingFetch(hang) : okFetch(ok));
    };
    const deps = { abortOnTimeout: true, timeoutMs: 10, makeOnDemandClient: makeClient, model: 'm' };
    const first = await summarizeSource(SOURCE, deps);
    assert.equal(first.ok, false);
    if (!first.ok) assert.match(first.error, new RegExp(OLLAMA_TIMEOUT_MESSAGE));
    assert.deepEqual(hang.aborted, [true]);
    const second = await summarizeSource(SOURCE, deps);
    assert.equal(clients, 2);
    assert.equal(ok.calls, 1);
    assert.equal(second.ok, true);
  }));

test('NEWS-211 on-demand full story: timeout aborts the HTTP request', () =>
  withKey(async () => {
    const log: HangLog = { signals: [], aborted: [] };
    const makeClient = (signal: AbortSignal) => createAbortableOllamaClient(signal, hangingFetch(log));
    await assert.rejects(
      enrichFullStory(
        {
          members: [
            {
              title: 't',
              publisherDomain: 'example.com',
              publishedAt: '2026-09-12T12:00:00.000Z',
              bodyOrSnippet: 'b',
              framingSummary: 'f',
            },
          ],
          requestedSections: [],
        },
        { abortOnTimeout: true, timeoutMs: 10, makeOnDemandClient: makeClient },
      ),
      new RegExp(OLLAMA_TIMEOUT_MESSAGE),
    );
    assert.deepEqual(log.aborted, [true]);
  }));

test('NEWS-211 refresh/auto path keeps the 30s default and makes one call with no abort client', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let calls = 0;
    let made = 0;
    let settled = false;
    const pending = summarizeSource(SOURCE, {
      model: 'm',
      makeOnDemandClient: () => {
        made += 1;
        return null;
      },
      ollama: {
        chat: () => {
          calls += 1;
          return new Promise(() => {});
        },
      },
    }).then((r) => {
      settled = true;
      return r;
    });
    mock.timers.tick(29_999);
    await Promise.resolve();
    assert.equal(settled, false);
    mock.timers.tick(1);
    const result = await pending;
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, new RegExp(OLLAMA_TIMEOUT_MESSAGE));
    assert.equal(calls, 1);
    assert.equal(made, 0);
  } finally {
    mock.timers.reset();
  }
});
