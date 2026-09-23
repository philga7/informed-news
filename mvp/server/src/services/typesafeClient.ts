import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { Questions, SystemOneRequest } from '@typesafe-ai/sdk';

// Pinned model to avoid drift; `jev-latest` drifts over time (NEWS-71).
const DEFAULT_MODEL = 'jev-1.13.0';

let client: TypeSafeClient | null | undefined;
let modelName = DEFAULT_MODEL;
let loggedInit = false;

function resolveModel(): string {
  return process.env.TYPESAFE_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * Lazy-init TypeSafe client. Returns null when API key is missing.
 *
 * Never logs the API key.
 */
export function getTypeSafeClient(): TypeSafeClient | null {
  if (client !== undefined) {
    return client;
  }

  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  modelName = resolveModel();

  if (!apiKey) {
    if (!loggedInit) {
      console.warn(
        '⚠️  TYPESAFE_API_KEY not configured — TypeSafe judgments disabled',
      );
      loggedInit = true;
    }
    client = null;
    return client;
  }

  try {
    client = new TypeSafeClient({
      apiKey,
      defaultModel: modelName,
    });

    if (!loggedInit) {
      console.log('✅ TypeSafe API configured (API key present)');
      console.log(`   Model: ${modelName}`);
      loggedInit = true;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Failed to initialize TypeSafe client: ${message}`);
    client = null;
  }

  return client;
}

export function getTypeSafeModelName(): string {
  modelName = resolveModel();
  return modelName;
}

/**
 * Wrapper around `TypeSafeClient.systemOne`.
 *
 * - Uses injected client when provided (tests)
 * - Otherwise uses singleton client from `getTypeSafeClient()`
 * - Throws when no client is configured (no network call)
 * - Applies `getTypeSafeModelName()` when request.model is omitted
 */
export async function systemOne<const Q extends Questions>(
  request: SystemOneRequest<Q>,
  injectedClient?: TypeSafeClient | null,
): ReturnType<TypeSafeClient['systemOne']> {
  const active =
    injectedClient !== undefined ? injectedClient : getTypeSafeClient();

  if (!active) {
    throw new Error('TypeSafe client not configured');
  }

  const requestWithModel: SystemOneRequest<Q> =
    request.model?.trim()
      ? request
      : {
          ...request,
          model: getTypeSafeModelName(),
        };

  return active.systemOne(requestWithModel);
}

/** Reset cached client (tests / env reload). */
export function resetTypeSafeClientForTests(): void {
  client = undefined;
  loggedInit = false;
}

