# NEWS-85 — Topics store, API, and Topics page (seeded with 23 topics)

**Spec:** Jira [NEWS-85](https://informedcrew.atlassian.net/browse/NEWS-85) (parent epic [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84) — Epic L topic-driven brief). The Jira description is the binding spec; this plan argues from it.

**Branch:** `feat/news-85-topics`

## Goal

The operator's topic list becomes a persisted, editable object: a flat JSON store in `mvp/server` seeded with 23 desired topics, a session-protected CRUD API, and a Kite `/topics` page to add/edit/remove desired and undesired topics and manage the existing keyword/outlet mutes. Nothing consumes topics yet (search ingest is NEWS-86, triage NEWS-87).

## Global Constraints

- Store: `mvp/data/topics.json` (already gitignored via `mvp/data/*.json`). Committed seed: `mvp/server/config/topics-seed.json`. Seed is used **only when the store file does not exist** (ENOENT). A store file with `topics: []` (operator deleted everything) must **not** re-seed.
- Topic shape (server + Kite must agree exactly):
  ```ts
  type TopicKind = 'desired' | 'undesired';
  type TopicLevel = 'core' | 'watch';
  type TopicSection = 'business' | 'technical' | 'action' | 'map' | 'history'; // canonical order
  type Topic = {
    id: string;
    name: string;
    kind: TopicKind;
    level: TopicLevel | null;   // required for desired; always null for undesired
    description: string;
    keywords: string[];
    searchQuery: string;
    sections: TopicSection[];   // always [] for undesired; canonical order, deduped
    notes: string;              // traps / exclusions guidance for triage
    createdAt: string;          // ISO
    updatedAt: string;          // ISO
  };
  type TopicsStore = { topics: Topic[]; updatedAt: string | null };
  ```
- Mute rules (`mute-rules.json`, `/api/brief/mutes`) are **unchanged** and keep working. **Mute always wins** over desired topics — documented now, enforced by the triage pipeline in NEWS-87.
- All `/api/topics*` routes sit behind `requireApiSession` (register them after the existing `app.use('/api', requireApiSession)` line in `mvp/server/src/app.ts`).
- Follow existing patterns: store helpers like `mvp/server/src/store/muteRulesStore.ts` (injectable paths for tests), DI via `CreateAppDeps` in `app.ts`, validation errors like `ManualSeedValidationError` in `mvp/server/src/services/manualBriefSeed.ts`, Kite proxies via `$lib/server/proxy`, Kite copy constants in a `$lib/*.ts` module like `$lib/radar.ts`.
- `/radar` stays live (retired in NEWS-91). `/topics` is added alongside it; do not remove Radar or its footer link.
- No new dependencies. No Supabase, no `_legacy/` changes. Never commit `mvp/.env` or `mvp/data/*.json`.
- Server tests: `node:test` via `npm test --prefix mvp/server` (new test files must be appended to the explicit list in `mvp/server/package.json` `scripts.test`). Typecheck: `npm run typecheck`. Kite unit tests: vitest (`apps/kite/vitest.config.unit.ts`). Repo checks: `npm run test:kite`.

## Rulings made while planning

- `notes` field added to the proposed shape — the seed table's "Notes" column (traps/exclusions) was grilled content that NEWS-87 triage needs; dropping it would lose it.
- "Ford Superduty" in the ticket table is seeded as **Ford Super Duty** (product name; the epic spells it that way).
- Seed topics get stable slug ids (e.g. `iran`, `ice-enforcement`) so later tickets can reference them; operator-created topics get `randomUUID()`.
- Topic names are unique case-insensitively (after trim) → `409` on conflict.
- `searchQuery` may be empty; NEWS-86 falls back to the topic name. Not required at create.
- Radar is not removed here (NEWS-91 owns that); "replaces Radar as the management surface" is satisfied by `/topics` owning topics + keyword/outlet mutes.

---

### Task 1: Topic model, input parsing, and committed seed

**Files**
- Create `mvp/server/src/types/topic.ts`
- Modify `mvp/server/src/types/index.ts` (re-export topic types/constants)
- Create `mvp/server/src/services/topicInput.ts`
- Create `mvp/server/src/services/topicInput.test.ts`
- Create `mvp/server/config/topics-seed.json`
- Create `mvp/server/src/services/topicSeed.ts`
- Create `mvp/server/src/services/topicSeed.test.ts`
- Modify `mvp/server/src/services/index.ts` (export the new public functions/classes)
- Modify `mvp/server/package.json` (append both new test files to `scripts.test`)

**`types/topic.ts`** — export `TOPIC_KINDS = ['desired','undesired'] as const`, `TOPIC_LEVELS = ['core','watch'] as const`, `TOPIC_SECTIONS = ['business','technical','action','map','history'] as const`, the derived union types `TopicKind`, `TopicLevel`, `TopicSection`, and:
```ts
export type TopicFields = {
  name: string;
  kind: TopicKind;
  level: TopicLevel | null;
  description: string;
  keywords: string[];
  searchQuery: string;
  sections: TopicSection[];
  notes: string;
};
export type TopicPatch = Partial<TopicFields>;
export type Topic = TopicFields & { id: string; createdAt: string; updatedAt: string };
export type TopicsStore = { topics: Topic[]; updatedAt: string | null };
export type TopicSeedEntry = TopicFields & { id: string };
```

**`services/topicInput.ts`**
- `export class TopicValidationError extends Error` (sets `name = 'TopicValidationError'`).
- Limits (exported constants): `TOPIC_NAME_MAX = 80`, `TOPIC_TEXT_MAX = 500` (description, searchQuery, notes each), `TOPIC_KEYWORDS_MAX = 50`, `TOPIC_KEYWORD_MAX = 100` (per keyword).
- `parseTopicPatch(body: unknown): TopicPatch` — validates and normalizes **only fields present** in the body; ignores unknown keys and any `id` / `createdAt` / `updatedAt`.
  - body not a plain object (null, array, primitive) → `TopicValidationError('body must be a JSON object')`
  - `name`: must be string; trimmed; empty → `'name is required'`; > 80 chars → `'name must be at most 80 characters'`
  - `kind`: must be one of `TOPIC_KINDS` → else `'kind must be desired or undesired'`
  - `level`: `null` or one of `TOPIC_LEVELS` → else `'level must be core or watch'`
  - `description`, `searchQuery`, `notes`: must be string → else `'<field> must be a string'`; trimmed; > 500 → `'<field> must be at most 500 characters'`
  - `keywords`: must be an array of strings → else `'keywords must be an array of strings'`; each trimmed, empties dropped, deduped case-insensitively keeping the first spelling, order preserved; any keyword > 100 chars → `'each keyword must be at most 100 characters'`; more than 50 after dedupe → `'at most 50 keywords'`
  - `sections`: must be an array of strings each in `TOPIC_SECTIONS` → else `'sections must be a list of: business, technical, action, map, history'`; deduped and returned in canonical `TOPIC_SECTIONS` order
- `finalizeTopicFields(base: Partial<TopicFields>, patch: TopicPatch): TopicFields` — merges `{...base, ...patch}` then applies:
  - missing name → `'name is required'`; missing kind → `'kind is required'`
  - `kind === 'undesired'` → `level = null`, `sections = []` (silently, regardless of input)
  - `kind === 'desired'` and level is null/missing → `TopicValidationError('level is required for desired topics')`
  - defaults: `description`, `searchQuery`, `notes` → `''`; `keywords`, `sections` → `[]`
- `parseTopicCreate(body: unknown): TopicFields` = `finalizeTopicFields({}, parseTopicPatch(body))`.

**`topicInput.test.ts`** (node:test, `assert/strict`) — cover at minimum: minimal desired create (`{name:' Iran ', kind:'desired', level:'core'}`) → trimmed name and defaults; undesired create with `level:'core'` and `sections:['map']` → `level null`, `sections []`; desired without level → throws with message `level is required for desired topics`; non-object body; bad kind; bad level; unknown section `'weather'`; keywords `['  Iran ', 'iran', '', 'Tehran']` → `['Iran','Tehran']`; sections `['history','map','map']` → `['map','history']`; name of 81 chars rejected; 51 distinct keywords rejected; `parseTopicPatch({ level: 'watch' })` returns exactly `{ level: 'watch' }`; `finalizeTopicFields(existingDesired, { kind: 'undesired' })` clears level and sections; `finalizeTopicFields(existingUndesired, { kind: 'desired' })` without level throws.

**`config/topics-seed.json`** — commit exactly this content (23 desired topics; 12 core, 11 watch):

```json
{
  "topics": [
    {
      "id": "iran",
      "name": "Iran",
      "kind": "desired",
      "level": "core",
      "description": "Iranian state affairs: nuclear program, sanctions, IRGC, conflict with US/Israel, domestic politics",
      "keywords": ["Iran", "Tehran", "IRGC", "Iranian government"],
      "searchQuery": "Iran OR Tehran OR IRGC OR \"Iranian government\"",
      "sections": ["map", "history"],
      "notes": "Proxies only when Iran named/central; exclude national football team"
    },
    {
      "id": "israel",
      "name": "Israel",
      "kind": "desired",
      "level": "core",
      "description": "Israeli government and security: Gaza/Lebanon fighting, Netanyahu, US–Israel relations",
      "keywords": ["Israel", "Netanyahu", "IDF", "Gaza"],
      "searchQuery": "Israel OR Netanyahu OR IDF OR Gaza",
      "sections": ["map"],
      "notes": "Exclude US campus protest/antisemitism stories; people named Israel"
    },
    {
      "id": "ice-enforcement",
      "name": "ICE Enforcement",
      "kind": "desired",
      "level": "core",
      "description": "US immigration enforcement: ICE and CBP/Border Patrol arrests, raids, detention, deportations, DHS policy",
      "keywords": ["Immigration and Customs Enforcement", "ICE raid", "ICE detention", "deportation", "Border Patrol", "CBP"],
      "searchQuery": "\"Immigration and Customs Enforcement\" OR (ICE (immigration OR deportation OR raid OR detention OR arrests))",
      "sections": [],
      "notes": "Traps: hockey, ice storms, Intercontinental Exchange, ICE vehicles"
    },
    {
      "id": "venezuela",
      "name": "Venezuela",
      "kind": "desired",
      "level": "core",
      "description": "Venezuelan government (Maduro), US–Venezuela military/sanctions tensions, oil, migration",
      "keywords": ["Venezuela", "Maduro", "Caracas", "Tren de Aragua"],
      "searchQuery": "Venezuela OR Maduro OR Caracas OR \"Tren de Aragua\"",
      "sections": ["map"],
      "notes": "Exclude MLB players, pageants"
    },
    {
      "id": "government-shutdown",
      "name": "Government Shutdown",
      "kind": "desired",
      "level": "core",
      "description": "US federal funding lapses: appropriations, continuing resolutions, furloughs",
      "keywords": ["government shutdown", "continuing resolution", "appropriations", "furlough"],
      "searchQuery": "\"government shutdown\" OR \"continuing resolution\" OR (appropriations Congress) OR furlough",
      "sections": ["action"],
      "notes": "Federal only"
    },
    {
      "id": "tariffs",
      "name": "Tariffs",
      "kind": "desired",
      "level": "core",
      "description": "US tariff/trade policy: Section 232/301/IEEPA, deals, retaliation, court rulings, price impacts",
      "keywords": ["tariff", "tariffs", "trade war", "Section 232", "Section 301", "IEEPA"],
      "searchQuery": "tariffs OR tariff OR \"trade war\" OR \"Section 232\" OR IEEPA",
      "sections": ["business"],
      "notes": "Trap: utility \"tariffs\""
    },
    {
      "id": "epstein-files",
      "name": "Epstein Files",
      "kind": "desired",
      "level": "core",
      "description": "Release and fallout of government Jeffrey Epstein records: DOJ, FBI, Congress, Maxwell, named associates",
      "keywords": ["Epstein files", "Jeffrey Epstein", "Ghislaine Maxwell"],
      "searchQuery": "\"Epstein files\" OR \"Jeffrey Epstein\" OR \"Ghislaine Maxwell\"",
      "sections": ["history"],
      "notes": "Traps: other Epsteins, Epstein-Barr"
    },
    {
      "id": "doge-audits",
      "name": "DOGE Audits",
      "kind": "desired",
      "level": "core",
      "description": "Department of Government Efficiency cuts, contract cancellations, data access, GAO/IG audits",
      "keywords": ["Department of Government Efficiency", "DOGE"],
      "searchQuery": "\"Department of Government Efficiency\" OR (DOGE (audit OR cuts OR contracts OR federal))",
      "sections": [],
      "notes": "Federal only; trap: Dogecoin"
    },
    {
      "id": "election-integrity",
      "name": "Election Integrity",
      "kind": "desired",
      "level": "core",
      "description": "Voting security/administration: voter rolls, voter ID, SAVE Act, machines, fraud claims, litigation; includes \"voting rights\" framing",
      "keywords": ["election integrity", "voter rolls", "voter ID", "SAVE Act", "election security", "voting machines", "voting rights"],
      "searchQuery": "\"election integrity\" OR \"voter rolls\" OR \"voter ID\" OR \"SAVE Act\" OR \"election security\" OR \"voting machines\"",
      "sections": ["history"],
      "notes": "US only"
    },
    {
      "id": "georgia-elections",
      "name": "Georgia elections",
      "kind": "desired",
      "level": "core",
      "description": "Elections in the US state of Georgia: State Election Board, Secretary of State, Fulton County, races, voting law, governor race",
      "keywords": ["Georgia election", "State Election Board", "Raffensperger", "Fulton County"],
      "searchQuery": "Georgia (election OR \"State Election Board\" OR Raffensperger OR \"Fulton County\" OR runoff OR primary) -Tbilisi -\"Georgian Dream\"",
      "sections": ["history"],
      "notes": "Trap: country of Georgia"
    },
    {
      "id": "federal-elections",
      "name": "federal elections",
      "kind": "desired",
      "level": "core",
      "description": "US federal races: midterms, House/Senate races, FEC, redistricting",
      "keywords": ["midterms", "midterm elections", "Senate race", "House race", "redistricting", "FEC"],
      "searchQuery": "midterms OR \"midterm elections\" OR \"Senate race\" OR \"House race\" OR redistricting OR FEC",
      "sections": ["history"],
      "notes": "Exclude other countries; governors only via Georgia elections"
    },
    {
      "id": "supreme-court",
      "name": "Supreme Court",
      "kind": "desired",
      "level": "core",
      "description": "US Supreme Court rulings, docket, emergency orders, justices; plus Georgia Supreme Court",
      "keywords": ["Supreme Court", "SCOTUS", "justices", "Georgia Supreme Court"],
      "searchQuery": "\"Supreme Court\" OR SCOTUS OR justices",
      "sections": [],
      "notes": "Exclude other state and foreign courts"
    },
    {
      "id": "pandemic-outbreaks",
      "name": "Pandemic & outbreaks",
      "kind": "desired",
      "level": "watch",
      "description": "COVID-19, H5N1, measles and other outbreaks; vaccine policy (CDC, ACIP, FDA); preparedness",
      "keywords": ["COVID-19", "COVID", "pandemic", "bird flu", "H5N1", "measles", "CDC", "ACIP"],
      "searchQuery": "COVID OR \"COVID-19\" OR pandemic OR \"bird flu\" OR H5N1 OR measles outbreak",
      "sections": [],
      "notes": "Exclude passing \"since the pandemic\" mentions"
    },
    {
      "id": "federal-contracting",
      "name": "Federal Contracting",
      "kind": "desired",
      "level": "watch",
      "description": "US government procurement: awards, protests, GSA consolidation, FAR overhaul, GWACs, 8(a)/small-business rules",
      "keywords": ["federal contract", "federal contractors", "federal contracting", "GSA contract", "FAR overhaul", "8(a)", "GWAC"],
      "searchQuery": "\"federal contract\" OR \"federal contractors\" OR \"federal contracting\" OR \"GSA contract\" OR \"FAR overhaul\" OR \"8(a)\"",
      "sections": ["business"],
      "notes": "Routine award PRs only when significant"
    },
    {
      "id": "valley-it",
      "name": "Valley IT",
      "kind": "desired",
      "level": "watch",
      "description": "Valley IT Solutions LLC (Fargo, ND): 8(a)-graduate DoD C6ISR/IT contractor, STARS III holder",
      "keywords": ["Valley IT Solutions", "Valley IT"],
      "searchQuery": "\"Valley IT Solutions\" OR (\"Valley IT\" Fargo)",
      "sections": [],
      "notes": "Near-zero news volume; USAspending later"
    },
    {
      "id": "bison-computing",
      "name": "Bison Computing",
      "kind": "desired",
      "level": "watch",
      "description": "Bison Computing LLC: Valley IT's rugged GPU / edge server line for DoD",
      "keywords": ["Bison Computing"],
      "searchQuery": "\"Bison Computing\"",
      "sections": ["technical"],
      "notes": "Traps: bison, NDSU Bison, Bison Transport"
    },
    {
      "id": "palantir",
      "name": "Palantir",
      "kind": "desired",
      "level": "watch",
      "description": "Palantir Technologies: government/defense contracts, AI platforms, civil-liberties debate, earnings",
      "keywords": ["Palantir", "PLTR"],
      "searchQuery": "Palantir OR PLTR",
      "sections": ["business"],
      "notes": "Stock-tip/market commentary = trash"
    },
    {
      "id": "dod-it-modernization",
      "name": "DoD IT Modernization",
      "kind": "desired",
      "level": "watch",
      "description": "Pentagon enterprise IT: cloud (JWCC), zero trust, CMMC, CIO policy, software acquisition, AI adoption",
      "keywords": ["IT modernization", "JWCC", "zero trust", "CMMC", "DoD CIO", "software acquisition"],
      "searchQuery": "(Pentagon OR DoD OR \"Defense Department\" OR \"War Department\") (\"IT modernization\" OR JWCC OR \"zero trust\" OR CMMC OR \"DoD CIO\" OR \"software acquisition\")",
      "sections": ["technical"],
      "notes": "DoD only; exclude weapons \"modernization\""
    },
    {
      "id": "gas-prices",
      "name": "gas prices",
      "kind": "desired",
      "level": "watch",
      "description": "US retail gasoline prices, national and Georgia averages, AAA/GasBuddy, crude drivers",
      "keywords": ["gas prices", "gasoline prices", "GasBuddy", "price at the pump"],
      "searchQuery": "\"gas prices\" OR \"gasoline prices\" OR GasBuddy OR \"price at the pump\"",
      "sections": ["business", "action"],
      "notes": "Traps: natural gas, crypto gas fees"
    },
    {
      "id": "diesel-prices",
      "name": "diesel prices",
      "kind": "desired",
      "level": "watch",
      "description": "US on-highway diesel prices (EIA weekly), trucking/freight cost impact",
      "keywords": ["diesel prices", "diesel price", "diesel fuel", "diesel costs"],
      "searchQuery": "\"diesel prices\" OR \"diesel price\" OR \"diesel fuel\" OR \"diesel costs\"",
      "sections": ["business", "action"],
      "notes": "Traps: Diesel brand, Vin Diesel"
    },
    {
      "id": "brinkley-rv",
      "name": "Brinkley RV",
      "kind": "desired",
      "level": "watch",
      "description": "Goshen, IN towable RV maker (Models Z, Z AIR, G, I, R)",
      "keywords": ["Brinkley RV", "Brinkley Model Z", "Brinkley Model G", "Brinkley Model R"],
      "searchQuery": "\"Brinkley RV\" OR \"Brinkley Model Z\" OR \"Brinkley Model G\" OR \"Brinkley Model R\"",
      "sections": ["action"],
      "notes": "Not wider RV industry"
    },
    {
      "id": "ford-super-duty",
      "name": "Ford Super Duty",
      "kind": "desired",
      "level": "watch",
      "description": "Ford F-250/350/450 Super Duty pickups: recalls, model years, pricing, towing",
      "keywords": ["Super Duty", "F-250", "F-350", "F-450"],
      "searchQuery": "\"Super Duty\" OR \"F-250\" OR \"F-350\" OR \"F-450\"",
      "sections": ["technical", "action"],
      "notes": "Not F-150"
    },
    {
      "id": "honda-cars",
      "name": "Honda cars",
      "kind": "desired",
      "level": "watch",
      "description": "Honda and Acura automobiles: models, recalls, pricing, tariffs",
      "keywords": ["Honda", "Acura", "Civic", "Accord", "CR-V", "HR-V"],
      "searchQuery": "(Honda (Civic OR Accord OR \"CR-V\" OR \"HR-V\" OR Pilot OR Prologue OR recall) OR Acura) -motorcycle",
      "sections": ["action"],
      "notes": "Exclude motorcycles, F1/IndyCar, HondaJet, Honda Center"
    }
  ]
}
```

**`services/topicSeed.ts`**
- `export const DEFAULT_TOPICS_SEED_PATH` = absolute path to `mvp/server/config/topics-seed.json` (resolve relative to the module exactly like `DEFAULT_RADAR_SOURCES_PATH` in `services/loadRadarSources.ts`).
- `export function loadTopicSeed(seedPath: string = DEFAULT_TOPICS_SEED_PATH): TopicSeedEntry[]` — synchronous read + `JSON.parse`; each entry must have a non-empty string `id` and pass `parseTopicCreate`. Unlike radar sources, a broken seed **throws** (it is committed config; failing loudly beats silently seeding nothing): missing file / invalid JSON rethrow; a non-array `topics` or a bad entry throws `Error` naming the entry index; duplicate ids or duplicate names (case-insensitive) throw.

**`topicSeed.test.ts`** — against the real committed file: 23 entries; all `kind === 'desired'`; 12 `core`, 11 `watch`; ids unique; names unique; every entry has non-empty `description`, `searchQuery`, `keywords`; spot-check sections: `iran` → `['map','history']`, `gas-prices` → `['business','action']`, `ford-super-duty` → `['technical','action']`, `palantir` → `['business']`, `ice-enforcement` → `[]`. Against temp files: invalid entry (desired with no level) throws; duplicate id throws.

**Verify:** `npm test --prefix mvp/server` and `npm run typecheck` pass.

**Commit:** `feat(news-85): topic model, input validation, and 23-topic seed`

---

### Task 2: Topics store (seed-on-missing, create, update, remove)

**Depends on Task 1** (`TopicFields`, `TopicPatch`, `Topic`, `TopicsStore`, `parseTopicPatch`, `finalizeTopicFields`, `TopicValidationError`, `loadTopicSeed`, `DEFAULT_TOPICS_SEED_PATH`).

**Files**
- Modify `mvp/server/src/store/paths.ts` — add `export const TOPICS_PATH = path.join(DATA_DIR, 'topics.json');`
- Create `mvp/server/src/store/topicsStore.ts`
- Create `mvp/server/src/store/topicsStore.test.ts`
- Modify `mvp/server/src/store/index.ts` — export the store functions, `TopicConflictError`, `TopicsStorePaths` type, and `TOPICS_PATH`
- Modify `mvp/server/package.json` — append the new test file to `scripts.test`

**API** (`topicsStore.ts`)
```ts
export type TopicsStorePaths = { topicsPath?: string; seedPath?: string };
export class TopicConflictError extends Error {} // name = 'TopicConflictError'; message: `a topic named "<name>" already exists`
export async function readTopics(paths?: TopicsStorePaths): Promise<TopicsStore>;
export async function createTopic(fields: TopicFields, paths?: TopicsStorePaths): Promise<{ topic: Topic; topics: Topic[] }>;
export async function updateTopic(id: string, patch: TopicPatch, paths?: TopicsStorePaths): Promise<{ topic: Topic; topics: Topic[] } | null>;
export async function removeTopic(id: string, paths?: TopicsStorePaths): Promise<{ removed: boolean; topics: Topic[] }>;
```
Defaults: `topicsPath = TOPICS_PATH`, `seedPath = DEFAULT_TOPICS_SEED_PATH`.

**Behavior**
- `readTopics`: ensure the store's directory exists (as `muteRulesStore` does). On `ENOENT` → build topics from `loadTopicSeed(seedPath)` with `createdAt = updatedAt = now` (one shared ISO timestamp), write `{ topics, updatedAt: now }` to disk, return it. Other read errors rethrow. Existing file: must be a JSON object (else throw `'topics.json must contain a JSON object'`); normalize each entry — it must have non-empty string `id`, `createdAt`, `updatedAt` and pass `finalizeTopicFields({}, parseTopicPatch(entry))`; malformed entries are dropped; duplicate ids keep the first. `updatedAt` is string or null. An existing file with `topics: []` returns empty and does **not** re-seed.
- Writes: `JSON.stringify(store, null, 2)` + trailing newline, like `muteRulesStore`.
- `createTopic`: reads (which may seed), rejects a name equal (trim + case-insensitive) to any existing topic with `TopicConflictError`, appends `{ id: randomUUID(), ...fields, createdAt: now, updatedAt: now }`, bumps store `updatedAt`, writes, returns `{ topic, topics }`.
- `updateTopic`: trimmed id; not found → `null` (no write). `merged = finalizeTopicFields(existingFieldsWithoutMeta, patch)` (let `TopicValidationError` propagate); name conflict with a **different** topic → `TopicConflictError`; keeps `id` and `createdAt`, sets topic `updatedAt = now` and store `updatedAt = now`, preserves list order, writes.
- `removeTopic`: trimmed id; missing → `{ removed: false, topics }` without writing; else filters, bumps `updatedAt`, writes, `{ removed: true, topics }`.

**Tests** (`topicsStore.test.ts`, temp dirs via `mkdtempSync` like `muteRulesStore.test.ts`; always pass explicit `topicsPath`; use the real seed path unless the case needs a tiny temp seed):
- missing store → 23 seeded topics, file written to disk, every topic has `createdAt`/`updatedAt`, ids match seed ids
- reading twice does not duplicate or change `createdAt`
- after removing all topics, `readTopics` returns `[]` (no re-seed)
- `createTopic` desired + undesired persist; new id is not a seed slug
- duplicate name (different case / extra spaces) → `TopicConflictError`, nothing written
- `updateTopic` level core→watch persists and bumps topic `updatedAt` but not `createdAt`
- `updateTopic` kind→undesired clears level + sections
- `updateTopic` renaming to another topic's name → `TopicConflictError`; renaming to its own name with different case succeeds
- `updateTopic` unknown id → `null`
- `removeTopic` removes and persists; unknown id → `removed: false`
- malformed entries in an existing file are dropped (e.g. entry missing `id`, entry with `kind: 'bogus'`)

**Verify:** `npm test --prefix mvp/server` and `npm run typecheck` pass.

**Commit:** `feat(news-85): topics JSON store with seed-on-missing`

---

### Task 3: Session-protected topics CRUD API + compat docs

**Depends on Tasks 1–2.**

**Files**
- Modify `mvp/server/src/app.ts`
- Modify `mvp/server/src/app.test.ts`
- Modify `docs/MVP_API_COMPAT.md`
- Modify `tests/mvp-api-compat.test.js`

**`app.ts`**
- Add to `CreateAppDeps`: `readTopics?`, `createTopic?`, `updateTopic?`, `removeTopic?` (typed `typeof <fn>`), resolved with `??` defaults like the mute deps.
- Register after the mute routes (all after `requireApiSession`):
  - `GET /api/topics` → `200 { ok: true, topics, updatedAt }`
  - `POST /api/topics` → `parseTopicCreate(req.body)` → `createTopic` → `201 { ok: true, topic, topics }`
  - `PATCH /api/topics/:id` → `parseTopicPatch(req.body)` → `updateTopic(req.params.id, patch)`; `null` → `404 { ok: false, error: 'topic not found' }`; else `200 { ok: true, topic, topics }`
  - `DELETE /api/topics/:id` → `200 { ok: true, removed, topics }` (idempotent, like mute delete)
  - Error mapping for POST/PATCH: `TopicValidationError` → `400 { ok: false, error: err.message }`; `TopicConflictError` → `409 { ok: false, error: err.message }`; anything else → `500 { ok: false, error }` with a `console.error('Topic <verb> failed:', message)` like neighbors.
- Short JSDoc block above the routes in the style of the mute block, stating: operator topic list (NEWS-85); mute rules still apply and always win over desired topics.

**`app.test.ts`** — follow the existing mute tests (env setup, `startServer`, `login`, DI with temp paths: `readTopics: async () => await readTopics({ topicsPath })`, etc.). Cases:
- `GET /api/topics` without a session cookie → `401`
- `GET /api/topics` on an empty temp store → 23 topics
- `POST` desired topic → `201`, returned in list; `POST` undesired topic with `level: 'core'` → stored with `level: null`
- `POST` missing name → `400`; desired without level → `400` with error `level is required for desired topics`; unknown section → `400`
- `POST` duplicate name → `409`
- `PATCH /api/topics/iran { level: 'watch' }` → `200`, subsequent `GET` shows `watch`
- `PATCH` unknown id → `404`; `PATCH` with invalid body (`{ kind: 'bogus' }`) → `400`
- `DELETE /api/topics/iran` → `removed: true`, gone from `GET`; repeat → `removed: false`

**`docs/MVP_API_COMPAT.md`** — add four rows to the frozen routes table directly after the `DELETE /api/brief/mutes/:id` row, same column style (`| METHOD | \`path\` | Session | description |`), linking [NEWS-85](https://informedcrew.atlassian.net/browse/NEWS-85). The GET row documents the `Topic` shape (all fields from Global Constraints) and that an absent `mvp/data/topics.json` is seeded from `mvp/server/config/topics-seed.json` (an emptied list is not re-seeded). POST/PATCH rows document `400` validation, `409` duplicate name, PATCH `404`, undesired forcing `level: null` + `sections: []`. Add one sentence after the table: keyword/outlet mute rules (`/api/brief/mutes`) are unchanged and **mute always wins** over desired topics (enforced by triage, NEWS-87).

**`tests/mvp-api-compat.test.js`** — in the server-routes test add `assert.match(src, /app\.get\('\/api\/topics'/)`, `/app\.post\('\/api\/topics'/`, `/app\.patch\('\/api\/topics\/:id'/`, `/app\.delete\('\/api\/topics\/:id'/`; in the docs test add the matching `GET \| \`/api/topics\``, `POST \| \`/api/topics\``, `PATCH \| \`/api/topics/:id\``, `DELETE \| \`/api/topics/:id\`` matches.

**Verify:** `npm test --prefix mvp/server`, `npm run typecheck`, `npm run test:kite` pass.

**Commit:** `feat(news-85): session-protected topics CRUD API`

---

### Task 4: Kite topics client module + API proxies

**Depends on Task 3's API contract** (paths, bodies, response shapes above). Kite code must not import from `mvp/server`; mirror the types.

**Files**
- Create `apps/kite/src/routes/api/topics/+server.ts` — `GET` and `POST` via `proxyGET('/topics')` / `proxyPOST('/topics')` (pattern: `apps/kite/src/routes/api/brief/mutes/+server.ts`)
- Create `apps/kite/src/routes/api/topics/[id]/+server.ts` — `PATCH` and `DELETE` via `proxyPATCH('/topics/[id]')` / `proxyDELETE('/topics/[id]')` (pattern: `.../brief/mutes/[id]/+server.ts`; `$lib/server/proxy` already exports `PATCH`)
- Create `apps/kite/src/lib/topics.ts`
- Create `apps/kite/src/lib/__tests__/topics.test.ts`

**`$lib/topics.ts`**
- Types mirroring the server: `TopicKind`, `TopicLevel`, `TopicSection`, `Topic` (exact field list in Global Constraints), and `TopicPayload` = the writable fields (`name, kind, level, description, keywords, searchQuery, sections, notes`).
- `TOPIC_SECTIONS: ReadonlyArray<{ id: TopicSection; label: string }>` in canonical order with labels: business → `Business angle`, technical → `Technical details`, action → `What you can do`, map → `Map`, history → `History`.
- Copy constants (same style as `$lib/radar.ts`; import `PRODUCT_NAME` from `./brand`):
  - `TOPICS_PAGE_TITLE = \`Topics — ${PRODUCT_NAME}\``
  - `TOPICS_PAGE_DESCRIPTION` — one sentence: the operator's topic list drives what the Brief searches for and filters out.
  - `TOPICS_LOGIN_INTRO` — topics are limited to the MVP operator session; enter the local API password.
  - `TOPICS_INTRO_HELP = 'Desired topics drive what the Brief looks for. Core topics get top stories every refresh; Watch topics surface only significant developments. Undesired topics and mute rules filter stories out — mutes always win.'`
  - Section titles: `TOPICS_CORE_TITLE = 'Core'`, `TOPICS_WATCH_TITLE = 'Watch'`, `TOPICS_UNDESIRED_TITLE = 'Undesired'`, `TOPICS_MUTES_TITLE = 'Keyword & outlet mutes'`
  - `TOPICS_MUTES_HELP = 'Stories matching a keyword (optionally only from one outlet) are always filtered out, even when they match a desired topic.'`
  - Empty copy: `TOPICS_EMPTY_DESIRED = 'No topics at this level yet.'`, `TOPICS_EMPTY_UNDESIRED = 'No undesired topics yet.'`
  - Labels: `TOPICS_ADD_TITLE = 'Add topic'`, `TOPICS_ADD_LABEL = 'Add topic'`, `TOPICS_SAVE_LABEL = 'Save'`, `TOPICS_CANCEL_LABEL = 'Cancel'`, `TOPICS_EDIT_LABEL = 'Edit'`, `TOPICS_REMOVE_LABEL = 'Remove'`, `TOPICS_MOVE_TO_CORE_LABEL = 'Move to Core'`, `TOPICS_MOVE_TO_WATCH_LABEL = 'Move to Watch'`, `TOPICS_PENDING_LABEL = 'Saving…'`
  - Field labels: `TOPICS_FIELD_KIND = 'Type'`, `TOPICS_KIND_DESIRED = 'Desired'`, `TOPICS_KIND_UNDESIRED = 'Undesired'`, `TOPICS_FIELD_LEVEL = 'Level'`, `TOPICS_FIELD_NAME = 'Name'`, `TOPICS_FIELD_DESCRIPTION = 'Description'`, `TOPICS_FIELD_KEYWORDS = 'Keywords (comma or newline separated)'`, `TOPICS_FIELD_QUERY = 'Search query'`, `TOPICS_FIELD_NOTES = 'Notes (traps / exclusions)'`, `TOPICS_FIELD_SECTIONS = 'Extra full-story sections'`
  - `TOPICS_REMOVE_CONFIRM_TEMPLATE = 'Remove topic "{name}"?'`
  - Errors: `TOPICS_LOAD_ERROR = 'Could not load topics. Try again.'`, `TOPICS_SAVE_ERROR = 'Could not save topic. Try again.'`, `TOPICS_REMOVE_ERROR = 'Could not remove topic. Try again.'`, `TOPICS_NETWORK_ERROR = 'Network error while talking to the topics API. Check that the server is running on :3001.'`
- Pure helpers:
  - `parseKeywordsInput(text: string): string[]` — split on commas and newlines, trim, drop empties, dedupe case-insensitively keeping first spelling, preserve order.
  - `formatKeywordsInput(keywords: readonly string[]): string` — `keywords.join(', ')`.
  - `groupTopics(topics: readonly Topic[]): { core: Topic[]; watch: Topic[]; undesired: Topic[] }` — desired split by level; each group sorted by name case-insensitively (`localeCompare` with `sensitivity: 'base'`); input not mutated.
  - `type TopicFormState = { name: string; kind: TopicKind; level: TopicLevel; description: string; keywordsText: string; searchQuery: string; sections: TopicSection[]; notes: string }`
  - `emptyTopicForm(kind: TopicKind = 'desired'): TopicFormState` — level defaults to `'watch'`, everything else empty.
  - `topicToForm(topic: Topic): TopicFormState` — `level` falls back to `'watch'` when the topic's level is null.
  - `formToPayload(form: TopicFormState): TopicPayload` — trims text fields, `keywords = parseKeywordsInput(form.keywordsText)`, sections in canonical order; when `kind === 'undesired'` → `level: null`, `sections: []`.
  - `removeConfirmMessage(name: string): string` — fills the template.

**`topics.test.ts`** (vitest, pattern: `src/lib/__tests__/briefSeed.test.ts`) — cover each helper: keyword parsing with mixed separators/duplicates/blanks; `groupTopics` grouping + case-insensitive sort + no mutation; `formToPayload` for desired (level kept, sections canonicalized) and undesired (level null, sections []); `topicToForm` round-trip via `formToPayload` preserves fields; `topicToForm` on an undesired topic yields level `'watch'`; `removeConfirmMessage`.

Run from `apps/kite`: `bunx vitest run --config vitest.config.unit.ts src/lib/__tests__/topics.test.ts` (if that invocation fails for environment reasons, confirm the existing `src/lib/__tests__/briefSeed.test.ts` runs the same way and report what works).

**Verify:** the new vitest file passes; `npm run test:kite` still passes.

**Commit:** `feat(news-85): Kite topics client module and API proxies`

---

### Task 5: Kite `/topics` page, footer link, route docs, smoke test

**Depends on Task 4** (`$lib/topics.ts` exports and `/api/topics*` proxies) and the existing `/api/brief/mutes` proxies.

**Files**
- Create `apps/kite/src/lib/components/topics/TopicForm.svelte`
- Create `apps/kite/src/lib/components/topics/TopicCard.svelte`
- Create `apps/kite/src/routes/topics/+page.svelte`
- Modify `apps/kite/src/lib/brand.ts` — add `'footer.topics': { text: 'Topics', translationContext: 'Footer link to session-gated topics management page (NEWS-85)' }` next to `'footer.radar'`
- Modify `apps/kite/src/lib/components/Footer.svelte` — add a `href="/topics"` link immediately **before** the Radar link, same markup/classes as the Radar link, label `{s("footer.topics") || "Topics"}`, a simple stroke icon (e.g. a list/tag glyph, `aria-hidden="true"`); no badge
- Modify `docs/ROUTE_MAP.md` — add a `/topics` row to **Shipped (live)** right after `/transparency`: Session-required; operator topic list (NEWS-85, Epic L NEWS-84); Core / Watch / Undesired sections with add / edit / remove, Core↔Watch move, description / keywords / search query / notes / extra sections; keyword & outlet mutes via shared `/api/brief/mutes` (mute always wins); topics do not drive ingest until NEWS-86/87; `/radar` stays until NEWS-91
- Modify `tests/nav-shell.test.js` — assert `ROUTE_MAP.md` contains `` `/topics` `` inside the Shipped section, `apps/kite/src/routes/topics/+page.svelte` exists, and the footer contains `href="/topics"` (keep all existing asserts)
- Modify `e2e/kite-smoke.spec.ts` — next to the `/radar` smoke test add `'/topics loads session shell with Topics title'`: goto `/topics`, expect title `/Topics/i` and heading `Topics` visible (same timeouts as the radar test)
- Modify `AGENTS.md` — in the Security list's "Product routes" bullet, add Topics `/topics` (session) alongside Brief and Transparency

**Svelte conventions:** Svelte 5 runes (`$props`, `$state`, `$derived`), as in `apps/kite/src/lib/components/ManualBriefSeedModal.svelte`. Tailwind utility classes and dark-mode variants consistent with `apps/kite/src/routes/radar/+page.svelte` (reuse its visual language: section headings, bordered cards, small pill chips, button styles). All user-visible strings come from `$lib/topics` (or existing radar mute constants where the text fits exactly — otherwise add to `$lib/topics`).

**`TopicForm.svelte`** — props: `initial: TopicFormState`, `submitLabel: string`, `pending: boolean`, `error: string | null`, `onSubmit: (payload: TopicPayload) => void`, optional `onCancel?: () => void`. Local editable copy of `initial`. Fields: Type radio (Desired / Undesired); Level select (Core / Watch) shown only when Desired; Name (required, `maxlength=80`); Description textarea; Keywords textarea; Search query input (only when Desired); Notes textarea; Extra sections checkboxes from `TOPIC_SECTIONS` (only when Desired). Every control has a `<label>`. Submit calls `onSubmit(formToPayload(state))`; Cancel shown only when `onCancel` is given. Shows `error` in a `role="alert"` element.

**`TopicCard.svelte`** — props: `topic: Topic`, `pending: boolean`, `onMoveLevel?: (level: TopicLevel) => void` (desired only), `onSave: (payload: TopicPayload) => void`, `onRemove: () => void`, `error: string | null`. Collapsed view: name (heading), level chip for desired, description, keyword chips, search query in monospace (when non-empty), section chips (labels from `TOPIC_SECTIONS`), notes (muted small text, when non-empty). Actions: Move to Core / Move to Watch (desired only — shows the opposite of the current level), Edit (toggles an inline `TopicForm` prefilled via `topicToForm`, submit label Save, with Cancel), Remove (calls `onRemove`; the page does the confirm).

**`routes/topics/+page.svelte`**
- `<svelte:head>`: `<title>{TOPICS_PAGE_TITLE}</title>` and meta description `TOPICS_PAGE_DESCRIPTION`. Page `<h1>` text is exactly `Topics`.
- Auth: on mount fetch `GET /api/topics` and `GET /api/brief/mutes` (`credentials: 'include'`). Any `401` → show the login shell (password form → `POST /api/login`, then reload data) mirroring the Radar login markup/flow (`handleLogin` / `handleLogout` in `routes/radar/+page.svelte`, ~lines 632–700 and the login section ~1180–1230). Signed-in view has a Log out control like Radar.
- Layout (top to bottom): header (h1 + `TOPICS_INTRO_HELP`); **Add topic** panel with `TopicForm` (`emptyTopicForm()`), POST → on success replace the topics list with the response `topics` and reset the form; `400`/`409` show the server `error` text; **Core** / **Watch** / **Undesired** sections (from `groupTopics`), each with a count and its empty copy; **Keyword & outlet mutes** section with `TOPICS_MUTES_HELP`, list of rules (keyword, optional source), add form (keyword + optional source → `POST /api/brief/mutes`), per-rule delete (`DELETE /api/brief/mutes/:id`) — same behavior as Radar's mute section.
- Card actions: move level → `PATCH /api/topics/:id { level }`; edit save → `PATCH` with the full payload; remove → `window.confirm(removeConfirmMessage(name))` then `DELETE`. After each success replace the list with the response `topics`. Per-card pending + error state keyed by topic id. A `401` mid-session flips back to the login shell. Network failures show `TOPICS_NETWORK_ERROR`.
- No polling; edits take effect immediately server-side (no restart needed).

**Verify:**
- `npm run test:kite` passes.
- From `apps/kite`: `bun run check` — no new errors/warnings in the files this task creates or modifies (pre-existing issues elsewhere may be noted in the report, not fixed).
- `npm run test:e2e:kite -- -g "Topics"` passes if the local environment can start `npm run dev`; if it cannot (e.g. missing `mvp/.env`), say so in the report instead of skipping silently.

**Commit:** `feat(news-85): Kite Topics page with desired/undesired topics and mutes`
