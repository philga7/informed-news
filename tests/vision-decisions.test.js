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
		assert.match(vision, /When the image is served, the running Brief is the SPA Briefs module at `\/`/);
		assert.match(vision, /`npm run dev` still serves Kite at `\/`/);
		assert.match(
			vision,
			/Kite Brief code remains in the repo until \[NEWS-202\]\([^)]+\) and \[NEWS-203\]/,
		);
		assert.match(vision, /keyboard, filters, shared links, accessibility/);
		assert.match(vision, /before \[NEWS-202\]\([^)]+\) removes that view/);
	});

	it('records the Oct 23 decisions with a decision, a why, and what each rules out', () => {
		const decisions = read('docs/DECISIONS.md');
		const entries = decisions.split(/^## /m).slice(1);
		const oct23 = entries.filter((entry) => entry.startsWith('2026-10-23'));
		assert.ok(oct23.length >= 5, `expected several Oct 23 entries, got ${oct23.length}`);
		const dates = entries.map((entry) => entry.slice(0, 10));
		for (let i = 1; i < dates.length; i++) {
			assert.ok(
				dates[i - 1] >= dates[i],
				`entries are newest first: ${dates[i - 1]} then ${dates[i]}`,
			);
		}
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
		const review = entries.find((entry) => entry.startsWith('2026-10-31 — Spec and plain-English changelog'));
		assert.ok(review, 'NEWS-175 review decision missing');
		assert.match(review, /NEWS-175/);
		assert.match(review, /Do not bump Last checked/);
		assert.match(review, /true at merge/);
		assert.match(review, /other repos/);
		assert.match(review, /\*\*Why:\*\*/);
		assert.match(review, /\*\*What it rules out:\*\*/);
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
			'NEWS-190',
			'NEWS-193',
			'NEWS-191',
			'NEWS-192',
			'NEWS-170',
			'NEWS-200',
			'NEWS-195',
			'NEWS-201',
			'NEWS-39',
			'NEWS-202',
			'NEWS-203',
		]);
		assert.match(
			combined,
			/Reordered 2026-10-27: hosting pulled ahead of NEWS-168\/169, approved by Phil\./,
		);
		assert.match(
			combined,
			/\*\*Current next\*\* \(paused 2026-11-12; see the next-wave note\) is \[NEWS-201\]\([^)]+\): Story Desk at `\/story`/,
		);
		assert.match(roadmap, /NEWS-175[\s\S]{0,400}\*\*Done\*\*/);
		assert.match(roadmap, /NEWS-182[\s\S]{0,200}\*\*Done\*\*/);
		assert.match(roadmap, /NEWS-168[\s\S]{0,120}\*\*Done\*\*/);
		assert.doesNotMatch(roadmap, /Process trial \(approved 2026-10-26\)/);
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
		assert.ok(at('NEWS-168') !== -1 && at('NEWS-168') < at(nextClause), 'NEWS-168 is Done before Current next');
		assert.ok(nextAt('NEWS-170') !== -1 && nextAt('NEWS-170') < nextAt('NEWS-192'));
		assert.ok(nextAt('NEWS-192') < nextAt('NEWS-191'));
		assert.ok(nextAt('NEWS-191') < nextAt('NEWS-190'));
		assert.ok(nextAt('NEWS-190') < nextAt('NEWS-193'));
		assert.ok(nextAt('NEWS-193') < nextAt('NEWS-169'));
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

	it('records the Nov 12 UI direction and leaves the data layer proposed', () => {
		const vision = read('docs/VISION.md');
		assert.match(vision, /## UI direction/);
		assert.match(vision, /OSINT-style news dashboard/);
		assert.match(vision, /dark and minimalist/);
		assert.match(vision, /grok\.com\/dashboard/);
		assert.match(vision, /cfbtrack\.com/);
		assert.match(vision, /stocknear\.com/);
		assert.match(vision, /Telegram pings/);
		assert.match(vision, /Grok Bot chats and Pages/);
		assert.match(vision, /one-glance overview/);
		assert.match(vision, /stories that update in place/i);
		assert.match(vision, /what changed since you last looked/);
		assert.match(vision, /visible sources and filters/i);
		assert.match(vision, /Telegram stays for pings/);
		assert.match(vision, /Each ping deep-links to the new entry on the site/);

		const decisions = read('docs/DECISIONS.md');
		const entries = decisions.split(/^## /m).slice(1);
		const nov12 = entries.filter((entry) => entry.startsWith('2026-11-12'));
		const headings = nov12.map((entry) => entry.split('\n', 1)[0]);
		for (const title of [
			'Dashboard home is one screen',
			'Story page is a timeline',
			'Each tracker has its own +N new count',
			'CFP is one merged list',
			'Morning Telegram messages stay',
			'Telegram deep link opens at the new entry',
			'Data layer is proposed',
			'Feature tickets are on hold',
		]) {
			assert.ok(
				headings.some((heading) => heading.includes(title)),
				`missing 2026-11-12 decision: ${title}`,
			);
		}
		const proposed = nov12.find((entry) => entry.includes('Data layer is proposed'));
		assert.ok(proposed, 'data-layer decision missing');
		assert.match(proposed, /PROPOSED/);
		assert.match(proposed, /not decided/);
		assert.match(proposed, /Supabase \(Postgres\)/);
		assert.match(proposed, /Phil's Vercel account/);
		assert.match(proposed, /pending a design review/);
		assert.match(proposed, /no-Supabase-on-the-live-path invariant in \[AGENTS\.md\]/);
		assert.match(proposed, /design review has to decide that explicitly/);
		assert.match(proposed, /passed design review is not permission to wire Supabase in/);
		assert.match(proposed, /Phil has to change that invariant first/);
		assert.match(proposed, /developing stories, Morning items, and CFP roundups/);

		const home = nov12.find((entry) => entry.includes('Dashboard home is one screen'));
		assert.match(home, /N trackers have news/);
		assert.match(home, /Breaking/);
		assert.match(home, /Developing stories/);
		assert.match(home, /BLUF, weather, market brief, OSINT brief/);
		assert.match(home, /Citizen Free Press/);
		assert.match(home, /My topics/);

		const story = nov12.find((entry) => entry.includes('Story page is a timeline'));
		assert.match(story, /dated entries with sources/);
		assert.match(story, /part of/);

		const count = nov12.find((entry) => entry.includes('+N new count'));
		assert.match(count, /scrolls past the new entries/);
		assert.match(count, /not when the story is opened/);

		const cfp = nov12.find((entry) => entry.includes('CFP is one merged list'));
		assert.match(cfp, /newest first/);
		assert.match(cfp, /roundup time/);

		const morning = nov12.find((entry) => entry.includes('Morning Telegram messages stay'));
		assert.match(morning, /one line each/);
		assert.match(morning, /plus a link into the site/);

		const link = nov12.find((entry) => entry.includes('Telegram deep link'));
		assert.match(link, /highlighted/);

		const hold = nov12.find((entry) => entry.includes('Feature tickets are on hold'));
		assert.match(hold, /until the UI build tickets are sequenced/);
		assert.match(hold, /superseded on that point/);
		assert.match(hold, /does not change their Jira status/);
		assert.match(hold, /recorded exception to the header rule/);

		const roadmap = read('docs/ROADMAP.md');
		assert.match(roadmap, /next wave is the UI build/);
		assert.match(roadmap, /order will be proposed separately/);
		assert.match(roadmap, /paused pending re-sequencing/);
		assert.match(roadmap, /remove Kite Brief routes/);
		assert.match(roadmap, /Kite Brief cleanup/);
		assert.match(roadmap, /are not paused by this note/);
		assert.match(roadmap, /all paused 2026-11-12 \(see the next-wave note\)/);
		assert.match(roadmap, /product next \(now paused; see the next-wave note\)/);
		assert.doesNotMatch(roadmap, /as the product next\./);
		assert.match(roadmap, /Jira is unchanged until that proposal/);
		assert.match(roadmap, /overrides the Jira-wins rule for these tickets/);
		assert.match(roadmap, /Story Desk at its own link/);
		assert.match(roadmap, /Brief banner shows no status while a refresh is running/);
		assert.match(roadmap, /build commit SHA with the version/);
		assert.match(roadmap, /Mark as read and Mark all as read while signed out/);
		assert.match(roadmap, /log provider call counts per refresh/);
		assert.match(roadmap, /Last fetch shows raw UTC/);
		assert.match(
			roadmap,
			/\*\*Current next\*\* \(paused 2026-11-12; see the next-wave note\) is \[NEWS-201\]\([^)]+\): Story Desk at `\/story`/,
		);
		assert.doesNotMatch(roadmap, /\*\*Current next\*\* is \[NEWS-201\]/);

		const agents = read('AGENTS.md');
		assert.match(agents, /\*\*Current next\*\* is the UI build/);
		assert.match(
			agents,
			/\[NEWS-201\]\([^)]+\), \[NEWS-202\]\([^)]+\), \[NEWS-203\]\([^)]+\), and \[NEWS-219\]\([^)]+\) through \[NEWS-223\]\([^)]+\) are paused/,
		);
		assert.doesNotMatch(agents, /\*\*Current next\*\* is \[NEWS-200\]/);

		const whatsNew = read('docs/WHATS_NEW.md');
		const nov13Notes = whatsNew.split(/^## /m).find((entry) => entry.startsWith('2026-11-13'));
		assert.ok(nov13Notes, '2026-11-13 what\'s-new entry missing');
		assert.match(nov13Notes, /\*\*No user-visible change\.\*\*/);
	});
});
