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
	/** Energy grid: 3 top stories + 1 behind "More" */
	gridMoreCount: 1,
	summaryText:
		'Regional operators added battery storage ahead of the winter peak, according to the published filing.',
	fullStoryTalkingPoint:
		'The published capacity plan combines battery storage, transmission upgrades, and demand response before the winter peak.',
	duplicateOutletBadge: '+1 outlet',
};

function topic(def, now, keywords) {
	return {
		id: def.id,
		name: def.name,
		kind: 'desired',
		level: def.level,
		description: `${def.name} (e2e fixture topic)`,
		keywords,
		searchQuery: def.name,
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

	const lead = gridStories[0];
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
			],
			updatedAt: hoursAgo(now, 72),
		},
		'articles.json': [...gridStories, portLead, portDuplicate],
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
		'meta.json': {
			lastFetchAt: hoursAgo(now, 1),
			lastError: null,
			refresh: { last: refreshRun, lastSuccess: refreshRun },
		},
	};
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
 *   a duplicate-member story and one cached summary.
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
