import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DashboardStoreError } from './storeSupport.js';
import {
  BREAKING_LABELS,
  CFP_STATUSES,
  ENTRY_LABELS,
  MORNING_KINDS,
  STORY_ROLES,
  STORY_STATUSES,
  cfpStatus,
  entryLabel,
  entryPrecision,
  storyStatus,
} from './vocabulary.js';

const DECISIONS = new URL('../../../../../docs/DECISIONS.md', import.meta.url);
const HEADING = '## 2026-11-16 — Status labels are a fixed list';

/** "Claim · no new evidence" is stored as "claim_no_new_evidence". */
function stored(display: string): string {
  return display
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** The "Used on | Value | Tone" table of the fixed-list decision, as stored values per use. */
function decidedValues(): Map<string, string[]> {
  const text = readFileSync(DECISIONS, 'utf8');
  const start = text.indexOf(HEADING);
  assert.notEqual(start, -1, 'the fixed-list decision is in docs/DECISIONS.md');
  const section = text.slice(start, text.indexOf('\n## ', start + HEADING.length));
  const lines = section.split('\n');
  const header = lines.findIndex((line) => /^\|\s*Used on\s*\|\s*Value\s*\|\s*Tone\s*\|/.test(line));
  assert.notEqual(header, -1, 'the decision has a Used on / Value / Tone table');
  const values = new Map<string, string[]>();
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith('|')) break;
    const [usedOn, value] = line
      .split('|')
      .slice(1, 3)
      .map((cell) => cell.trim());
    assert.ok(usedOn && value, `unreadable row: ${line}`);
    const list = values.get(usedOn) ?? [];
    list.push(...value.split(',').map(stored));
    values.set(usedOn, list);
  }
  return values;
}

test('the stored values are the fixed list in docs/DECISIONS.md', () => {
  const decided = decidedValues();
  assert.deepEqual([...decided.keys()].sort(), [
    'CFP items',
    'Entries and Breaking',
    'Morning kind',
    'Story role',
    'Story status',
  ]);
  assert.deepEqual([...ENTRY_LABELS], decided.get('Entries and Breaking'));
  assert.equal(BREAKING_LABELS, ENTRY_LABELS, 'Breaking items use the entry labels');
  assert.deepEqual([...CFP_STATUSES], decided.get('CFP items'));
  assert.deepEqual([...STORY_STATUSES], decided.get('Story status'));
  assert.deepEqual([...STORY_ROLES], decided.get('Story role'));
  assert.deepEqual([...MORNING_KINDS], decided.get('Morning kind'));
});

test('there is no Debunked, Rumor or Verified label', () => {
  for (const ruledOut of ['debunked', 'rumor', 'verified']) {
    assert.throws(() => entryLabel(ruledOut), DashboardStoreError);
  }
});

test('a value outside its list is refused', () => {
  assert.equal(entryLabel('on_record'), 'on_record');
  assert.throws(() => entryLabel('On record'), /unexpected label On record/);
  assert.throws(() => cfpStatus('reported'), /unexpected CFP status reported/);
  assert.throws(() => storyStatus('working'), /unexpected story status working/);
  assert.throws(() => entryPrecision('week'), /unexpected entry precision week/);
});
