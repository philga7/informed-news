export const FEEDBACK_COMMENT_MAX = 500;

export type FeedbackSignal = 'like' | 'not_relevant';

type FeedbackTopicSnapshot = {
	id: string;
	name: string;
};

type FeedbackSnapshot = {
	headline: string;
	source: string;
	url: string;
	topics: FeedbackTopicSnapshot[];
};

export type FeedbackEntry = {
	id: string;
	itemId: string;
	signal: FeedbackSignal;
	comment: string;
	ts: string;
	snapshot: FeedbackSnapshot;
};

const FEEDBACK_ENTRY_TS = '2026-09-01T00:00:00.000Z';

export function feedbackEntry(overrides: Partial<FeedbackEntry> = {}): FeedbackEntry {
	const entry: FeedbackEntry = {
		id: 'fb-story-1',
		itemId: 'story-1',
		signal: 'like',
		comment: '',
		ts: FEEDBACK_ENTRY_TS,
		snapshot: {
			headline: 'Royal row deepens',
			source: 'dailymail.co.uk',
			url: 'https://dailymail.co.uk/story',
			topics: [{ id: 't1', name: 'Courts' }],
		},
		...overrides,
	};
	if (entry.comment.length > FEEDBACK_COMMENT_MAX) {
		entry.comment = entry.comment.slice(0, FEEDBACK_COMMENT_MAX);
	}
	return entry;
}

export function feedbackListBody(entries: FeedbackEntry[]) {
	return { ok: true as const, entries, updatedAt: null };
}

export function feedbackSavedBody(entry: FeedbackEntry, replaced = false) {
	return { ok: true as const, replaced, entry, entries: [entry] };
}

export type LessLikeThisBody =
	| { kind: 'outlet' }
	| { kind: 'subject'; name: string; keywords?: string[]; description?: string };

export function lessLikeThisUrl(articleId: string): string {
	return `/api/brief/stories/${encodeURIComponent(articleId)}/less-like-this`;
}

export function lessLikeThisSavedBody(name: string, created = true) {
	return { ok: true as const, created, topic: { name }, topics: [] as const };
}

export function removeSeedUrl(articleId: string): string {
	return `/api/brief/stories/${encodeURIComponent(articleId)}/remove`;
}

export function removeSeedSavedBody() {
	return { ok: true as const };
}

export type BriefCardFixture = {
	articleId: string;
	title: string;
	publisherDomain: string | null;
	blurred: boolean;
	filterKeywords: string[];
};

export function briefCard(overrides: Partial<BriefCardFixture> = {}): BriefCardFixture {
	return {
		articleId: 'story-1',
		title: 'Royal row deepens',
		publisherDomain: 'dailymail.co.uk',
		blurred: false,
		filterKeywords: [],
		...overrides,
	};
}

export function storyForLessLikeThis(card: BriefCardFixture): {
	title: string;
	informed_publisher_domain: string | null;
} {
	return { title: card.title, informed_publisher_domain: card.publisherDomain };
}
