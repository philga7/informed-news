/**
 * On-demand Ollama calls (NEWS-211). A card the operator opens right after a
 * heavy refresh can queue behind the refresh's leftover (un-aborted, timed-out)
 * calls on Ollama Cloud, so the 30s refresh default is too tight. On-demand
 * calls get a longer timeout and one retry — only for a timeout. Any other
 * error (unreachable host, bad key, bad payload) is reported at once.
 */
import { ON_DEMAND_OLLAMA_RETRIES } from './briefConfig.js';
import { createAbortableOllamaClient } from './ollamaFraming.js';

export const OLLAMA_TIMEOUT_MESSAGE = 'Ollama API request timed out';

export type OnDemandChatClient = {
  chat: (req: any) => Promise<{ message?: { content?: string } }>;
};
export type OnDemandClientFactory = (signal: AbortSignal) => OnDemandChatClient | null;

/**
 * One on-demand chat attempt on a fresh client. When the timeout fires the
 * AbortController aborts the in-flight HTTP request before the timeout error is
 * raised, so a retry never stacks on a leftover request. Shared by the
 * on-demand summary and full-story paths.
 */
export async function onDemandChat(
  req: unknown,
  timeoutMs: number,
  makeClient: OnDemandClientFactory = createAbortableOllamaClient,
): Promise<{ message?: { content?: string } }> {
  const controller = new AbortController();
  const client = makeClient(controller.signal);
  if (!client) throw new Error('Ollama service not available — OLLAMA_API_KEY not configured');

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(OLLAMA_TIMEOUT_MESSAGE));
    }, timeoutMs);
  });
  try {
    return await Promise.race([client.chat(req), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function isOllamaTimeout(message: string): boolean {
  return message.includes(OLLAMA_TIMEOUT_MESSAGE);
}

/** Result-style call: retries while the result is a timeout failure. */
export async function retryResultOnTimeout<T extends { ok: boolean; error?: string }>(
  attempt: () => Promise<T>,
  retries: number = ON_DEMAND_OLLAMA_RETRIES,
): Promise<T> {
  let result = await attempt();
  for (let left = retries; left > 0 && !result.ok && isOllamaTimeout(result.error ?? ''); left -= 1) {
    result = await attempt();
  }
  return result;
}

/** Throwing call: retries while the failure is a timeout. */
export async function retryThrowOnTimeout<T>(
  attempt: () => Promise<T>,
  retries: number = ON_DEMAND_OLLAMA_RETRIES,
): Promise<T> {
  for (let left = retries; ; left -= 1) {
    try {
      return await attempt();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (left <= 0 || !isOllamaTimeout(message)) throw err;
    }
  }
}
