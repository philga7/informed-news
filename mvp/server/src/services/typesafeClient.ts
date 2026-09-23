import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { Questions, SystemOneRequest, SystemOneResult } from '@typesafe-ai/sdk';

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

export type TypeSafeSystemOneSuccess<Q extends Questions> = {
  ok: true;
  result: SystemOneResult<Q>;
};

export type TypeSafeSystemOneFailure = {
  ok: false;
  error: string;
  model: string | null;
};

export type TypeSafeSystemOneResult<Q extends Questions> =
  | TypeSafeSystemOneSuccess<Q>
  | TypeSafeSystemOneFailure;

/**
 * Wrapper around `TypeSafeClient.systemOne`.
 *
 * - Uses injected client when provided (tests)
 * - Otherwise uses singleton client from `getTypeSafeClient()`
 * - Missing API key/client returns `{ ok: false }` (no throw)
 * - Applies `getTypeSafeModelName()` when request.model is omitted/blank
 */
export async function systemOne<const Q extends Questions>(
  request: SystemOneRequest<Q>,
  injectedClient?: TypeSafeClient | null,
): Promise<TypeSafeSystemOneResult<Q>> {
  const active =
    injectedClient !== undefined ? injectedClient : getTypeSafeClient();

  if (!active) {
    return {
      ok: false,
      error: 'TypeSafe service not available — TYPESAFE_API_KEY not configured',
      model: null,
    };
  }

  const requestWithModel: SystemOneRequest<Q> =
    typeof request.model === 'string' && request.model.trim()
      ? request
      : {
          ...request,
          model: getTypeSafeModelName(),
        };

  try {
    const result = await active.systemOne(requestWithModel);
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: message,
      model: requestWithModel.model ?? getTypeSafeModelName(),
    };
  }
}

/** Reset cached client (tests / env reload). */
export function resetTypeSafeClientForTests(): void {
  client = undefined;
  loggedInit = false;
}

