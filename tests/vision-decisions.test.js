import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function read(rel) {
	return readFileSync(join(root, rel), 'utf8');
}

function relativeLinkTargets(rel) {
	const text = read(rel);
	const dir = dirname(join(root, rel));
	const missing = [];
	for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
		let href = match[1];
		if (href.startsWith('http:') || href.startsWith('https:') || href.startsWith('mailto:') || href.startsWith('#')) {
			continue;
		}
		href = href.split('#')[0];
		if (!href) continue;
		const target = normalize(join(dir, href));
		if (!existsSync(target)) missing.push(`${href} (${target})`);
	}
	return missing;
}

describe('NEWS-165 vision and decisions', () => {
	it('records the target and the product that is running in docs/VISION.md', () => {
		const vision = read('docs/VISION.md');
		assert.match(vision, /philga7\/informed-news/);
		assert.match(vision, /https:\/\/themenonlab\.blog\/blog\/osint-shadowbroker-crucix-thinkcreate-intel-stack/);
		assert.match(vision, /Kite Brief/);
		assert.match(vision, /mvp\/server/);
		assert.match(vision, /no review queue/);
		assert.match(vision, /Raw/);
		assert.match(vision, /Scoring/);
		assert.match(vision, /Output/);
		assert.match(vision, /no AI/);
		assert.match(vision, /query expansion/);
		assert.match(vision, /scoring/i);
		assert.match(vision, /one API/i);
		assert.match(vision, /one MCP/i);
		assert.match(vision, /FLASH/);
		assert.match(vision, /PRIORITY/);
		assert.match(vision, /ROUTINE/);
		assert.match(vision, /Briefs/);
		assert.match(vision, /Story Desk/);
		assert.match(vision, /NEWS-34/);
		assert.match(vision, /NEWS-35/);
		assert.match(vision, /Signals/);
		assert.match(vision, /Map/);
		assert.match(vision, /news section first/i);
		assert.match(vision, /until \[NEWS-170\]/);
	});

	it('records the Oct 23 decisions with a decision, a why, and what each rules out', () => {
		const decisions = read('docs/DECISIONS.md');
		const entries = decisions.split(/^## /m).slice(1);
		const oct23 = entries.filter((entry) => entry.startsWith('2026-10-23'));
		assert.ok(oct23.length >= 5, `expected several Oct 23 entries, got ${oct23.length}`);
		const dates = entries.map((entry) => entry.slice(0, 10));
		assert.deepEqual(dates, [...dates].sort().reverse(), 'entries are newest first');
		for (const entry of entries) {
			assert.match(entry, /^\d{4}-\d{2}-\d{2} — /);
			assert.match(entry, /\*\*Decision:\*\*/);
			assert.match(entry, /\*\*Why:\*\*/);
			assert.match(entry, /\*\*What it rules out:\*\*/);
		}
		assert.ok(oct23.length >= 9, `expected the Oct 23 set, got ${oct23.length}`);
		const trial = entries.find((entry) => entry.startsWith('2026-10-26 — Product spec'));
		assert.ok(trial, 'product spec trial decision missing');
		assert.match(trial, /PRODUCT_SPEC\.md/);
		assert.match(trial, /WHATS_NEW\.md/);
		assert.match(trial, /5 tickets have merged since it landed/);
		assert.match(decisions, /NEWS-167/);
		assert.match(decisions, /NEWS-168/);
		assert.match(decisions, /NEWS-169/);
		assert.match(decisions, /NEWS-67/);
		assert.match(decisions, /NEWS-84/);
		assert.match(decisions, /NEWS-57/);
		assert.match(decisions, /NEWS-170/);
		assert.match(decisions, /category chips/i);
		assert.match(decisions, /YouTube/);
		assert.match(decisions, /Track a question/);
		assert.match(decisions, /informed-brain/);
		assert.match(decisions, /at least 2 distinct publishers/);
		assert.match(decisions, /80%/);
		assert.match(decisions, /30 labeled items/);
		assert.match(decisions, /Phil labels/);
		assert.match(decisions, /duplicate grouping stays/);
		assert.match(decisions, /News Desk Bot story spotting/);
		assert.match(decisions, /keyboard/);
		assert.match(decisions, /filters/);
		assert.match(decisions, /shared links/);
		assert.match(decisions, /accessibility/);
		assert.match(decisions, /query expansion/);
		assert.match(decisions, /reachability is open/);
		assert.match(decisions, /NEWS-109/);
	});

	it('orders the roadmap as the combined sequence and points agents at the new docs', () => {
		const roadmap = read('docs/ROADMAP.md');
		const agents = read('AGENTS.md');
		assert.match(roadmap, /\[VISION\.md\]\(VISION\.md\)/);
		assert.match(roadmap, /\[DECISIONS\.md\]\(DECISIONS\.md\)/);
		assert.match(agents, /docs\/VISION\.md/);
		assert.match(agents, /docs\/DECISIONS\.md/);

		const combined = roadmap.slice(
			roadmap.indexOf('### Combined order'),
			roadmap.indexOf('**Epic L'),
		);
		assert.ok(combined.length > 0, 'combined order section missing');
		const numbered = combined
			.split('\n')
			.filter((line) => /^\d+\. /.test(line))
			.join('\n')
			.replace(/\(https?:[^)]+\)/g, '');
		const keys = [...numbered.matchAll(/NEWS-\d+/g)].map((match) => match[0]);
		assert.deepEqual(keys, [
			'NEWS-131',
			'NEWS-155',
			'NEWS-174',
			'NEWS-165',
			'NEWS-171',
			'NEWS-167',
			'NEWS-172',
			'NEWS-173',
			'NEWS-109',
			'NEWS-110',
			'NEWS-111',
			'NEWS-112',
			'NEWS-168',
			'NEWS-169',
			'NEWS-170',
		]);
		assert.match(
			combined,
			/Reordered 2026-10-27: hosting pulled ahead of NEWS-168\/169, approved by Phil\./,
		);
		assert.match(combined, /NEWS-139/);
		assert.match(combined, /NEWS-128/);
		assert.match(combined, /NEWS-121/);
		assert.match(combined, /do not block/);
		assert.match(combined, /NEWS-34/);
		assert.match(combined, /NEWS-35/);
		assert.match(combined, /correlation/i);
		assert.match(combined, /no ticket/);
		assert.doesNotMatch(roadmap, /waits until the remaining product work is done/);

		const currentNext = agents.slice(agents.indexOf('**Current next:**'));
		const at = (key) => currentNext.indexOf(key);
		// The "Current next is …" clause (after the Done list) — not the bold label that opens the paragraph.
		const nextClause = '**Current next** is';
		const next = currentNext.slice(currentNext.indexOf(nextClause));
		const nextAt = (key) => next.indexOf(key);
		assert.ok(at('NEWS-167') !== -1 && at('NEWS-167') < at(nextClause), 'NEWS-167 is Done before Current next');
		assert.ok(at('NEWS-172') !== -1 && at('NEWS-172') < at(nextClause), 'NEWS-172 is Done before Current next');
		assert.ok(at('NEWS-173') !== -1 && at('NEWS-173') < at(nextClause), 'NEWS-173 is Done before Current next');
		assert.ok(nextAt('NEWS-168') !== -1 && nextAt('NEWS-168') < nextAt('NEWS-169'));
		assert.ok(at('NEWS-131') < at(nextClause), 'NEWS-131 is listed as Done before Current next');
	});

	it('keeps relative links alive and does not contradict docs/TRIAGE.md', () => {
		for (const rel of ['docs/VISION.md', 'docs/DECISIONS.md', 'docs/ROADMAP.md', 'AGENTS.md']) {
			const missing = relativeLinkTargets(rel);
			assert.deepEqual(missing, [], `${rel} has dead relative links: ${missing.join(', ')}`);
		}

		const triage = read('docs/TRIAGE.md');
		const vision = read('docs/VISION.md');
		const decisions = read('docs/DECISIONS.md');
		assert.match(triage, /Nothing in this path calls Ollama/);
		assert.match(triage, /Duplicate grouping/);
		assert.match(vision, /Ollama writes Brief verbiage for stories that are shown/);
		assert.doesNotMatch(`${vision}\n${decisions}`, /Ollama (runs|calls|triages)/i);
		assert.match(decisions, /duplicate grouping stays/);
		assert.match(decisions, /\[TRIAGE\.md\]\(TRIAGE\.md\)/);
		assert.match(decisions, /not the live triage record/);
	});
});
