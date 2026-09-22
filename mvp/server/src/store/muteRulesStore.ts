import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, MUTE_RULES_PATH } from './paths.js';

export type MuteRule = {
  id: string;
  keyword: string;
  source: string | null;
  createdAt: string;
};

export type MuteRulesStore = {
  rules: MuteRule[];
  updatedAt: string | null;
};

const EMPTY_MUTES: MuteRulesStore = {
  rules: [],
  updatedAt: null,
};

function normalizeKeywordInput(keyword: string): string | null {
  const trimmed = keyword.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSourceInput(source: string | null | undefined): string | null {
  if (source === null || source === undefined) {
    return null;
  }
  const trimmed = source.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ruleKey(keyword: string, source: string | null): string {
  return `${keyword.trim().toLowerCase()}::${(source ?? '').trim().toLowerCase()}`;
}

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function ensureMuteDir(mutePath: string): Promise<void> {
  await mkdir(path.dirname(mutePath), { recursive: true });
}

function normalizeRule(raw: unknown): MuteRule | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Partial<MuteRule>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (id.length === 0) {
    return null;
  }

  const keyword =
    typeof record.keyword === 'string' ? record.keyword.trim() : '';
  if (keyword.length === 0) {
    return null;
  }

  const source =
    record.source === null || typeof record.source === 'string'
      ? record.source
      : null;

  const createdAt =
    typeof record.createdAt === 'string' ? record.createdAt.trim() : '';
  if (createdAt.length === 0) {
    return null;
  }

  return {
    id,
    keyword,
    source: normalizeSourceInput(source),
    createdAt,
  };
}

function normalizeMuteRules(parsed: unknown): MuteRulesStore {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('mute-rules.json must contain a JSON object');
  }

  const record = parsed as Partial<MuteRulesStore>;
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const rules: MuteRule[] = [];

  if (Array.isArray(record.rules)) {
    for (const raw of record.rules) {
      const rule = normalizeRule(raw);
      if (!rule) continue;
      if (seenIds.has(rule.id)) continue;
      const key = ruleKey(rule.keyword, rule.source);
      if (seenKeys.has(key)) continue;
      seenIds.add(rule.id);
      seenKeys.add(key);
      rules.push(rule);
    }
  }

  const updatedAt =
    record.updatedAt === null || typeof record.updatedAt === 'string'
      ? record.updatedAt
      : null;

  return { rules, updatedAt };
}

/**
 * Read mute rules from disk.
 * Missing file → empty rules.
 */
export async function readMuteRules(
  mutePath: string = MUTE_RULES_PATH,
): Promise<MuteRulesStore> {
  if (mutePath === MUTE_RULES_PATH) {
    await ensureDataDir();
  } else {
    await ensureMuteDir(mutePath);
  }

  try {
    const raw = await readFile(mutePath, 'utf8');
    return normalizeMuteRules(JSON.parse(raw));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { ...EMPTY_MUTES };
    }
    throw err;
  }
}

async function writeMuteRules(
  store: MuteRulesStore,
  mutePath: string = MUTE_RULES_PATH,
): Promise<void> {
  if (mutePath === MUTE_RULES_PATH) {
    await ensureDataDir();
  } else {
    await ensureMuteDir(mutePath);
  }

  await writeFile(mutePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

export type AddMuteRuleResult = {
  rules: MuteRule[];
};

/** Create a mute rule (idempotent for exact keyword+source). */
export async function addMuteRule(
  keyword: string,
  source: string | null | undefined = null,
  mutePath: string = MUTE_RULES_PATH,
): Promise<AddMuteRuleResult> {
  const normalizedKeyword = normalizeKeywordInput(keyword);
  if (!normalizedKeyword) {
    const store = await readMuteRules(mutePath);
    return { rules: store.rules };
  }
  const normalizedSource = normalizeSourceInput(source);

  const store = await readMuteRules(mutePath);
  const key = ruleKey(normalizedKeyword, normalizedSource);
  if (store.rules.some((r) => ruleKey(r.keyword, r.source) === key)) {
    return { rules: store.rules };
  }

  const next: MuteRulesStore = {
    rules: [
      ...store.rules,
      {
        id: randomUUID(),
        keyword: normalizedKeyword,
        source: normalizedSource,
        createdAt: new Date().toISOString(),
      },
    ],
    updatedAt: new Date().toISOString(),
  };
  await writeMuteRules(next, mutePath);
  return { rules: next.rules };
}

export type RemoveMuteRuleResult = {
  rules: MuteRule[];
};

/** Remove a rule by id (idempotent). */
export async function removeMuteRule(
  id: string,
  mutePath: string = MUTE_RULES_PATH,
): Promise<RemoveMuteRuleResult> {
  const trimmed = id.trim();
  if (!trimmed) {
    const store = await readMuteRules(mutePath);
    return { rules: store.rules };
  }

  const store = await readMuteRules(mutePath);
  if (!store.rules.some((r) => r.id === trimmed)) {
    return { rules: store.rules };
  }

  const next: MuteRulesStore = {
    rules: store.rules.filter((r) => r.id !== trimmed),
    updatedAt: new Date().toISOString(),
  };
  await writeMuteRules(next, mutePath);
  return { rules: next.rules };
}

