/**
 * Stubbed triage feedback step for E2E (NEWS-192). No model, no scrape, no pipeline.
 * Prints the feedback ids selectFeedback would put in the next scoring prompt.
 * With --cite, writes that citation onto one seeded Filtered record that is not already a feedback cite.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { advisoryFromJev } from '../../mvp/server/src/services/triageVerdict.ts';
import { selectFeedback } from '../../mvp/server/src/services/triageFeedback.ts';
import { resolveFeedbackLimits } from '../../mvp/server/src/services/triageConfig.ts';
import { readFeedback, type FeedbackEntry } from '../../mvp/server/src/store/feedbackStore.ts';

const dataDir = process.env.MVP_DATA_DIR?.trim();
if (!dataDir) {
	console.error('MVP_DATA_DIR is required');
	process.exit(1);
}

const cite = process.argv.includes('--cite');

const store = await readFeedback();
const liked = store.entries.find((entry) => entry.signal === 'like');
const anchor = liked ?? store.entries[0];

const promptIds = anchor
	? selectFeedback(
			store.entries,
			{
				source: anchor.snapshot.source,
				topicIds: anchor.snapshot.topics.map((topic) => topic.id),
			},
			resolveFeedbackLimits(),
		).map((entry) => entry.id)
	: [];

let citedId: string | null = null;
let title: string | null = null;
let articleId: string | null = null;

const cited: FeedbackEntry | undefined =
	(liked && promptIds.includes(liked.id) ? liked : undefined) ??
	store.entries.find((entry) => promptIds.includes(entry.id));

if (cite && cited) {
	citedId = cited.id;
	const triagePath = path.join(dataDir, 'triage.json');
	const articlesPath = path.join(dataDir, 'articles.json');
	const triage = JSON.parse(await readFile(triagePath, 'utf8')) as {
		records: Record<string, Record<string, unknown>>;
		updatedAt: string | null;
	};
	const articles = JSON.parse(await readFile(articlesPath, 'utf8')) as { id: string; title: string }[];
	const titles = new Map(articles.map((article) => [article.id, article.title]));

	const advisory = advisoryFromJev(
		{ decision: 'drop', reason: 'off_topic', topicIds: [], significance: 0 },
		{
			relevance: {},
			undesired: {},
			quality: { choice: 'news', confidence: 0.9 },
			significance: 0,
		},
		new Map(),
		undefined,
		{ id: cited.id, signal: cited.signal },
	);

	for (const [id, record] of Object.entries(triage.records)) {
		if (record.verdict !== 'filtered') continue;
		if (typeof record.reasonText !== 'string' || record.reasonText.trim().length === 0) continue;
		if (typeof record.criteriaRef !== 'string') continue;
		if (record.criteriaRef.startsWith('rule:mute:') || record.criteriaRef.startsWith('feedback:')) {
			continue;
		}
		record.criteriaRef = advisory.criteriaRef;
		record.reasonText = advisory.reasonText;
		record.verdict = advisory.verdict;
		record.confidence = advisory.confidence;
		articleId = id;
		title = titles.get(id) ?? null;
		break;
	}

	if (articleId) await writeFile(triagePath, `${JSON.stringify(triage, null, 2)}\n`);
}

console.log(JSON.stringify({ promptIds, citedId, articleId, title }));
