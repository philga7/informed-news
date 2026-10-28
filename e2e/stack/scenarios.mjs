// Data scenarios for the hermetic test stack. mvp/server reads its JSON stores on
// every request, so a test can switch scenario by rewriting the data dir.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Must match mvp/server articleIdFromCanonicalUrl, or the store migration renames ids. */
function articleId(canonicalUrl) {
	return createHash('sha256').update(canonicalUrl).digest('hex').slice(0, 32);
}

/** Must match mvp/server summarySourceFor (title + body cap), or the summary reads as stale. */
function summaryHash(title, body) {
	const text = `${title}\n\n${body.slice(0, 3000)}`;
	return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function hoursAgo(now, hours) {
	return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

export const TOPIC_SCENARIO = {
	sections: [
		{ id: 'e2e-topic-grid', name: 'Energy grid', level: 'core' },
		{ id: 'e2e-topic-ports', name: 'Ports & shipping', level: 'core' },
	],
	quiet: [{ id: 'e2e-topic-space', name: 'Space launches', level: 'watch' }],
	/**
	 * NEWS-97: story card category labels use topic names (never upstream "WORLD").
	 * Owned category route slug stays `world` so Kite's default-enabled categories still match.
	 */
	forbiddenCardCategoryLabel: 'WORLD',
	/** Energy grid: 3 top stories + 1 behind "More" */
	gridMoreCount: 1,
	summaryText:
		'Regional operators added battery storage ahead of the winter peak, according to the published filing.',
	fullStoryTalkingPoint:
		'The published capacity plan combines battery storage, transmission upgrades, and demand response before the winter peak.',
	duplicateOutletBadge: '+1 outlet',
	/** Undesired topic that muted one seeded story (Filtered out, NEWS-90). */
	undesiredTopic: { id: 'e2e-topic-gossip', name: 'Celebrity gossip' },
	/** Every story the last seeded triage run dropped, with its Filtered out reason label. */
	filtered: [
		{ title: 'Celebrity spotted at power plant ribbon cutting', label: 'Muted' },
		{ title: 'Local bakery wins regional pastry award', label: 'Off-topic' },
		{ title: 'You will not believe what this battery can do', label: 'Clickbait' },
		{ title: 'Tentative deal ends port walkout', label: 'Duplicate' },
		{ title: 'Overnight capacity filing hits the scoring budget', label: 'Not scored (budget)' },
	],
	/**
	 * Dropped in an earlier refresh (triagedAt ≠ last run) but still inside 48h — only
	 * "Last 48 hours" on /filtered lists it (NEWS-105).
	 */
	filteredEarlier: {
		title: 'Column blames grid operators for summer heat',
		label: 'Opinion',
	},
	/** Seeded Brief story Less like this blocks by outlet (has a cached full story). */
	lessLikeThis: {
		title: 'Operators add battery storage before winter peak',
		domain: 'gridwatch.example',
	},
	/** Seeded Brief story for the Less like this subject (undesired topic) path (NEWS-105). */
	lessLikeThisSubject: {
		title: 'Transmission upgrade approved for northern corridor',
	},
	/**
	 * NEWS-172 citation-guard seeds (hermetic check log; no live network).
	 * Match story has only display:ok entries → no mark on the card.
	 */
	citationGuard: {
		matchTitle: 'Operators add battery storage before winter peak',
		unverifiedQuoteTitle: 'Transmission upgrade approved for northern corridor',
		unverifiedLinkTitle: 'Demand response program expands to small businesses',
		unconfirmedTitle: 'Port workers reach tentative agreement',
		/** NEWS-173 court marks seeded on the quote / link / claim stories (no live CourtListener). */
		courtUnresolvedTitle: 'Transmission upgrade approved for northern corridor',
		courtProceduralTitle: 'Demand response program expands to small businesses',
		courtDocketTitle: 'Demand response program expands to small businesses',
		courtNoTokenTitle: 'Port workers reach tentative agreement',
		courtRecordLabel: 'CourtListener record',
	},
};

function topic(def, now, keywords, kind = 'desired') {
	return {
		id: def.id,
		name: def.name,
		kind,
		level: kind === 'desired' ? def.level : null,
		description: `${def.name} (e2e fixture topic)`,
		keywords,
		searchQuery: kind === 'desired' ? def.name : '',
		sections: [],
		notes: '',
		createdAt: hoursAgo(now, 72),
		updatedAt: hoursAgo(now, 72),
	};
}

function article(now, { slug, title, domain, topicId, hours, body, imageBaseUrl }) {
	const canonicalUrl = `https://${domain}/e2e/${slug}`;
	return {
		id: articleId(canonicalUrl),
		title,
		sourceKind: 'search',
		canonicalUrl,
		citations: [{ label: 'Publisher', url: canonicalUrl }],
		publisherUrl: canonicalUrl,
		publisherDomain: domain,
		handle: null,
		publishedAt: hoursAgo(now, hours),
		snippet: `${title}.`,
		bodyText: body,
		bodyStatus: body ? 'ok' : 'unavailable',
		publisherTitle: null,
		imageUrl: imageBaseUrl ? `${imageBaseUrl}/favicon.svg` : null,
		imageCaption: imageBaseUrl ? `${title} (e2e image)` : null,
		imageCredit: imageBaseUrl ? domain : null,
		clusterId: null,
		fetchedAt: hoursAgo(now, hours),
		classification: null,
		classifiedAt: null,
		classifyError: null,
		topicIds: [topicId],
		searchProviders: ['searxng'],
	};
}

function keptAdvisory(topicId) {
	return {
		verdict: 'approved',
		confidence: 0.85,
		reasonText: `Kept for topic ${topicId}.`,
		criteriaRef: `topic:${topicId}`,
	};
}

function droppedAdvisory(reason) {
	if (reason.startsWith('muted:')) {
		const id = reason.slice('muted:'.length);
		return {
			verdict: 'filtered',
			confidence: 1,
			reasonText: `Muted by rule or undesired topic ${id}.`,
			criteriaRef: `rule:mute:${id}`,
		};
	}
	if (reason === 'duplicate') {
		return {
			verdict: 'filtered',
			confidence: 1,
			reasonText: 'Duplicate of another story already kept in this window.',
			criteriaRef: 'rule:duplicate',
		};
	}
	if (reason === 'not_scored_budget') {
		return {
			verdict: 'filtered',
			confidence: 1,
			reasonText: 'Not scored: this refresh’s Jev budget ran out.',
			criteriaRef: 'rule:budget',
		};
	}
	return {
		verdict: 'filtered',
		confidence: 1,
		reasonText: `Filtered as ${reason.replace(/_/g, ' ')}.`,
		criteriaRef: 'global',
	};
}

function kept(now, a, { topicId, significance, memberIds = [] }) {
	return {
		articleId: a.id,
		status: 'kept',
		reason: null,
		stage: 'survivor',
		final: true,
		topicIds: [topicId],
		labels: [],
		duplicateOf: null,
		memberIds,
		outletCount: 1 + memberIds.length,
		significance,
		bodyChecked: false,
		jevCalls: 1,
		triagedAt: hoursAgo(now, 1),
		...keptAdvisory(topicId),
	};
}

function duplicate(now, a, { topicId, of }) {
	return {
		articleId: a.id,
		status: 'dropped',
		reason: 'duplicate',
		stage: 'dedupe',
		final: true,
		topicIds: [topicId],
		labels: [],
		duplicateOf: of,
		memberIds: [],
		outletCount: null,
		significance: null,
		bodyChecked: false,
		jevCalls: 0,
		triagedAt: hoursAgo(now, 1),
		...droppedAdvisory('duplicate'),
	};
}

function dropped(now, a, { topicId, reason, stage, jevCalls, final = true, triagedHoursAgo = 1 }) {
	return {
		articleId: a.id,
		status: 'dropped',
		reason,
		stage,
		final,
		topicIds: [topicId],
		labels: [],
		duplicateOf: null,
		memberIds: [],
		outletCount: null,
		significance: null,
		bodyChecked: false,
		jevCalls,
		triagedAt: hoursAgo(now, triagedHoursAgo),
		...droppedAdvisory(reason),
	};
}

/** `meta.json → triage` for the last run: only records with `triagedAt === at`. */
function triageRun(now, records) {
	const at = hoursAgo(now, 1);
	const list = Object.values(records).filter((rec) => rec.triagedAt === at);
	const byReason = {};
	for (const rec of list) {
		if (rec.status !== 'dropped') continue;
		const key = rec.reason.startsWith('muted:') ? 'muted' : rec.reason;
		byReason[key] = (byReason[key] ?? 0) + 1;
	}
	const keptCount = list.filter((rec) => rec.status === 'kept').length;
	return {
		at,
		skipped: false,
		candidates: list.length,
		kept: keptCount,
		dropped: list.length - keptCount,
		byReason,
		jev: { budget: 300, used: list.reduce((sum, rec) => sum + rec.jevCalls, 0), errors: 0 },
		summaryBudget: 60,
		errors: [],
	};
}

const BODY =
	'Grid operators filed updated capacity plans this week. The filing lists new battery storage, transmission upgrades and demand response programs intended to cover the winter peak.';

function topicsScenario(now, imageBaseUrl) {
	const [grid, ports] = TOPIC_SCENARIO.sections;
	const [space] = TOPIC_SCENARIO.quiet;

	const gridStories = [
		{ slug: 'storage', title: 'Operators add battery storage before winter peak', domain: 'gridwatch.example', sig: 0.92 },
		{ slug: 'transmission', title: 'Transmission upgrade approved for northern corridor', domain: 'utilitydive.example', sig: 0.81 },
		{ slug: 'demand', title: 'Demand response program expands to small businesses', domain: 'energynews.example', sig: 0.74 },
		{ slug: 'tariff', title: 'Regulator opens review of overnight tariffs', domain: 'powerpost.example', sig: 0.41 },
	].map((s, i) =>
		article(now, {
			slug: s.slug,
			title: s.title,
			domain: s.domain,
			topicId: grid.id,
			hours: 2 + i,
			body: i === 3 ? null : BODY,
			imageBaseUrl,
		}),
	);

	const portLead = article(now, {
		slug: 'port-strike',
		title: 'Port workers reach tentative agreement',
		domain: 'shippingtimes.example',
		topicId: ports.id,
		hours: 3,
		body: BODY,
		imageBaseUrl,
	});
	const portDuplicate = article(now, {
		slug: 'port-strike-wire',
		title: 'Tentative deal ends port walkout',
		domain: 'wirewire.example',
		topicId: ports.id,
		hours: 4,
		body: BODY,
		imageBaseUrl: null,
	});

	const significance = [0.92, 0.81, 0.74, 0.41];
	const records = {};
	gridStories.forEach((a, i) => {
		records[a.id] = kept(now, a, { topicId: grid.id, significance: significance[i] });
	});
	records[portLead.id] = kept(now, portLead, {
		topicId: ports.id,
		significance: 0.66,
		memberIds: [portDuplicate.id],
	});
	records[portDuplicate.id] = duplicate(now, portDuplicate, { topicId: ports.id, of: portLead.id });

	const filteredTitle = (label) => TOPIC_SCENARIO.filtered.find((f) => f.label === label).title;
	const droppedStories = [
		{
			slug: 'ribbon',
			title: filteredTitle('Muted'),
			domain: 'tabloid.example',
			reason: `muted:${TOPIC_SCENARIO.undesiredTopic.id}`,
			stage: 'keyword',
			jevCalls: 0,
		},
		{
			slug: 'bakery',
			title: filteredTitle('Off-topic'),
			domain: 'townpaper.example',
			reason: 'off_topic',
			stage: 'headline',
			jevCalls: 1,
		},
		{
			slug: 'viral',
			title: filteredTitle('Clickbait'),
			domain: 'viralhub.example',
			reason: 'clickbait',
			stage: 'headline',
			jevCalls: 1,
		},
		{
			slug: 'budget',
			title: filteredTitle('Not scored (budget)'),
			domain: 'capwire.example',
			reason: 'not_scored_budget',
			stage: 'budget',
			jevCalls: 0,
			final: false,
		},
	].map((s, i) => {
		const a = article(now, {
			slug: s.slug,
			title: s.title,
			domain: s.domain,
			topicId: grid.id,
			hours: 5 + i,
			body: null,
			imageBaseUrl: null,
		});
		records[a.id] = dropped(now, a, {
			topicId: grid.id,
			reason: s.reason,
			stage: s.stage,
			jevCalls: s.jevCalls,
			final: s.final ?? true,
		});
		return a;
	});

	// Earlier refresh inside the 48h window — not in "Last refresh", yes in "Last 48 hours".
	const earlier = article(now, {
		slug: 'opinion-heat',
		title: TOPIC_SCENARIO.filteredEarlier.title,
		domain: 'opinions.example',
		topicId: grid.id,
		hours: 20,
		body: null,
		imageBaseUrl: null,
	});
	records[earlier.id] = dropped(now, earlier, {
		topicId: grid.id,
		reason: 'opinion',
		stage: 'headline',
		jevCalls: 1,
		triagedHoursAgo: 12,
	});
	droppedStories.push(earlier);

	const lead = gridStories[0];
	const quoteStory = gridStories[1];
	const linkStory = gridStories[2];
	const claimStory = portLead;
	const checkedAt = hoursAgo(now, 0.95);
	const runId = refreshRunId(now);
	const refreshRun = {
		trigger: 'manual',
		startedAt: hoursAgo(now, 1),
		completedAt: hoursAgo(now, 0.95),
		ok: true,
		error: null,
	};

	return {
		'topics.json': {
			topics: [
				topic(grid, now, ['grid', 'battery']),
				topic(ports, now, ['port', 'shipping']),
				topic(space, now, ['launch', 'rocket']),
				topic(TOPIC_SCENARIO.undesiredTopic, now, ['celebrity', 'gossip'], 'undesired'),
			],
			updatedAt: hoursAgo(now, 72),
		},
		'articles.json': [...gridStories, portLead, portDuplicate, ...droppedStories],
		'triage.json': { records, updatedAt: hoursAgo(now, 1) },
		'brief-summaries.json': {
			summaries: {
				[lead.id]: {
					articleId: lead.id,
					status: 'ok',
					text: TOPIC_SCENARIO.summaryText,
					sourceArticleId: lead.id,
					sourceHash: summaryHash(lead.title, BODY),
					model: 'e2e-fixture',
					error: null,
					generatedAt: hoursAgo(now, 0.95),
					trigger: 'refresh',
				},
			},
			updatedAt: hoursAgo(now, 0.95),
		},
		// Keep the full-story smoke hermetic: Kite hydrates this cached record and
		// expands it without an Ollama key or a live generation request.
		'brief-full-stories.json': {
			fullStories: {
				[lead.id]: {
					articleId: lead.id,
					status: 'ok',
					enrichment: {
						talking_points: [TOPIC_SCENARIO.fullStoryTalkingPoint],
						timeline: [
							{
								date: 'This week',
								content: 'Grid operators published the updated capacity plan.',
							},
						],
						suggested_qna: [
							{
								question: 'What should readers verify?',
								answer: 'Which projects have approved funding and construction dates.',
							},
						],
					},
					deterministic: {},
					sourceHash: 'e2e-cached-full-story',
					topicSections: [],
					model: 'e2e-fixture',
					error: null,
					generatedAt: hoursAgo(now, 0.95),
					trigger: 'refresh',
				},
			},
			updatedAt: hoursAgo(now, 0.95),
		},
		// NEWS-172: recorded citation-check-log only (no live network / guard run).
		'citation-check-log.json': {
			logs: {
				[lead.id]: {
					articleId: lead.id,
					runId,
					updatedAt: checkedAt,
					entries: [
						{
							kind: 'url',
							status: 'match',
							display: 'ok',
							itemId: lead.canonicalUrl,
							url: lead.canonicalUrl,
							checkedAt,
							runId,
						},
						{
							kind: 'quote',
							status: 'match',
							display: 'ok',
							itemId: 'quote:match-storage',
							quote: 'battery storage',
							checkedAt,
							runId,
						},
					],
				},
				[quoteStory.id]: {
					articleId: quoteStory.id,
					runId,
					updatedAt: checkedAt,
					entries: [
						{
							kind: 'quote',
							status: 'mismatch',
							display: 'unverified',
							itemId: 'quote:paraphrase-transmission',
							quote: 'Operators quietly approved a northern corridor upgrade yesterday.',
							checkedAt,
							runId,
						},
						{
							kind: 'court',
							status: 'missing-source',
							display: 'unverified',
							itemId: 'court:unresolved-1',
							url: 'https://www.courtlistener.com/opinion/900001/smith-v-jones/',
							citation: '999 U.S. 999',
							checkedAt,
							runId,
						},
					],
				},
				[linkStory.id]: {
					articleId: linkStory.id,
					runId,
					updatedAt: checkedAt,
					entries: [
						{
							kind: 'url',
							status: 'missing-source',
							display: 'unverified',
							itemId: 'https://missing.example/demand-response',
							url: 'https://missing.example/demand-response',
							checkedAt,
							runId,
						},
						{
							kind: 'court',
							status: 'match',
							display: 'ok',
							itemId: 'court:procedural-1',
							url: 'https://www.courtlistener.com/opinion/900002/doe-v-roe/',
							citation: '123 F.3d 456',
							procedural: true,
							checkedAt,
							runId,
						},
						{
							kind: 'court',
							status: 'match',
							display: 'ok',
							itemId: 'court:docket-1',
							url: 'https://www.courtlistener.com/docket/900003/acme-v-grid/',
							courtRecordUrl: 'https://www.courtlistener.com/docket/900003/acme-v-grid/?order_by=desc',
							checkedAt,
							runId,
						},
					],
				},
				[claimStory.id]: {
					articleId: claimStory.id,
					runId,
					updatedAt: checkedAt,
					entries: [
						{
							kind: 'claim',
							status: 'missing-source',
							display: 'unconfirmed',
							itemId: 'claim:tariff-refute',
							refutingUrl: null,
							checkedAt,
							runId,
						},
						{
							kind: 'court',
							status: 'missing-source',
							display: 'unverified',
							itemId: 'court:no-token-1',
							url: 'https://www.courtlistener.com/opinion/900004/port-v-union/',
							citation: '55 Cal.4th 1',
							checkedAt,
							runId,
						},
					],
				},
			},
			updatedAt: checkedAt,
		},
		'meta.json': {
			lastFetchAt: hoursAgo(now, 1),
			lastError: null,
			refresh: { last: refreshRun, lastSuccess: refreshRun },
			triage: triageRun(now, records),
		},
	};
}

function refreshRunId(now) {
	return hoursAgo(now, 1);
}

function emptyScenario() {
	return {
		'articles.json': [],
		'meta.json': { lastFetchAt: null, lastError: null },
	};
}

/**
 * Replace every store file in `dataDir` with the named scenario.
 * - `topics`: the topic Brief (NEWS-88) — 2 sections, 1 quiet topic, a "More" story,
 *   a duplicate-member story and one cached summary; the last triage run also dropped
 *   muted / off-topic / clickbait / duplicate / not_scored_budget (NEWS-90/105), plus one
 *   earlier-in-window opinion drop for the Last 48 hours toggle (NEWS-105); citation-check-log
 *   seeds for match / unverified quote / unverified link / unconfirmed (NEWS-172).
 * - `empty`: empty article store → the owned-brief fixture stories (NEWS-44/51).
 * Files not starting with "." are removed first; the generated env file survives.
 */
export function writeScenario(dataDir, name, { now = new Date(), imageBaseUrl = null } = {}) {
	mkdirSync(dataDir, { recursive: true });
	for (const entry of readdirSync(dataDir)) {
		if (!entry.startsWith('.')) rmSync(path.join(dataDir, entry), { recursive: true, force: true });
	}
	const files =
		name === 'topics' ? topicsScenario(now, imageBaseUrl) : name === 'empty' ? emptyScenario() : null;
	if (!files) throw new Error(`Unknown e2e scenario: ${name}`);
	for (const [file, data] of Object.entries(files)) {
		writeFileSync(path.join(dataDir, file), `${JSON.stringify(data, null, 2)}\n`);
	}
}
