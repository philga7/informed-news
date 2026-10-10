/** Filtered out (NEWS-90): what triage dropped and why, for spot checks only. */

import { PRODUCT_NAME } from '$lib/brand';

/** Display order: `muted` covers every `muted:<id>` reason (mirrors mvp/server). */
export const FILTERED_REASON_GROUPS = [
	'muted',
	'off_topic',
	'clickbait',
	'opinion',
	'rewrite',
	'sponsored',
	'not_significant',
	'duplicate',
	'undated',
	'stale',
	'not_scored_budget',
	'not_scored_error',
] as const;
export type FilteredReasonGroup = (typeof FILTERED_REASON_GROUPS)[number];

export const FILTERED_REASON_LABEL: Record<FilteredReasonGroup, string> = {
	muted: 'Muted',
	off_topic: 'Off-topic',
	clickbait: 'Clickbait',
	opinion: 'Opinion',
	rewrite: 'Rewrite / roundup',
	sponsored: 'Sponsored',
	not_significant: 'Not significant',
	duplicate: 'Duplicate',
	undated: 'Undated',
	stale: 'Too old',
	not_scored_budget: 'Not scored (budget)',
	not_scored_error: 'Not scored (error)',
};

export type FilteredOutScope = 'last' | 'window';

export const FILTERED_SCOPES: readonly FilteredOutScope[] = ['last', 'window'];

export const FILTERED_SCOPE_LABEL: Record<FilteredOutScope, string> = {
	last: 'Last refresh',
	window: 'Last 48 hours',
};

export const FILTERED_PAGE_TITLE = `Filtered out — ${PRODUCT_NAME}`;

export const FILTERED_PAGE_DESCRIPTION = `Stories the last ${PRODUCT_NAME} refresh dropped, and why.`;

export const FILTERED_HEADING = 'Filtered out';

export const FILTERED_INTRO =
	'Stories the last refresh dropped, and why. For spot checks only — nothing here needs action.';

export const FILTERED_DISCLAIMER =
	'Reasons from story scoring are AI-assisted judgments, not ground truth.';

export const FILTERED_EMPTY = 'Nothing was filtered out.';

export const FILTERED_LOGIN_HINT = 'Log in on Topics to see filtered stories';

export const FILTERED_LOADING_LABEL = 'Loading filtered stories…';

export const FILTERED_LOAD_ERROR = 'Filtered stories could not be loaded right now.';

export const FILTERED_SHOW_FEWER = 'Show fewer';

export const FILTERED_DUPLICATE_PREFIX = 'Duplicate of:';

export const FILTERED_MUTED_PREFIX = 'Muted by:';

export const FILTERED_NON_FINAL_NOTE = 'Retried next refresh';

export const FILTERED_ARTICLE_GONE = 'Article no longer stored';

export const FILTERED_BACK_TO_BRIEF = '← Back to Brief';

export const FILTERED_LINK_LABEL = 'Filtered out';

export const FILTERED_TOPICS_LINK = 'See what was filtered out';

export const FILTERED_NO_RUN = 'No refresh has triaged stories yet.';

export const FILTERED_SKIPPED_RUN = 'Last refresh did not triage stories';

/** Items shown per reason group before "Show all (N)". */
export const FILTERED_GROUP_PREVIEW = 20;

/** Server `TriageRunMeta` (meta.json → triage). */
export type FilteredOutRun = {
	at: string;
	skipped: boolean;
	candidates: number;
	kept: number;
	dropped: number;
	byReason: Record<string, number>;
	jev: { budget: number; used: number; errors: number };
	summaryBudget: number;
	errors: string[];
};

export type FilteredOutItem = {
	articleId: string;
	/** null when the article is gone */
	title: string | null;
	url: string | null;
	publisherDomain: string | null;
	publishedAt: string | null;
	sourceKind: string | null;
	reason: string;
	group: FilteredReasonGroup;
	final: boolean;
	stage: string;
	mutedBy: { kind: 'rule' | 'topic'; id: string; label: string } | null;
	topics: { id: string; name: string }[];
	duplicateOf: { articleId: string; title: string | null; url: string | null } | null;
	triagedAt: string;
};

export type FilteredOut = {
	scope: FilteredOutScope;
	run: FilteredOutRun | null;
	counts: Partial<Record<FilteredReasonGroup, number>>;
	items: FilteredOutItem[];
};

export type FilteredGroup = { group: FilteredReasonGroup; label: string; items: FilteredOutItem[] };

export type FilteredReasonCount = { group: FilteredReasonGroup; label: string; count: number };

export type FilteredOutResult =
	| { ok: true; data: FilteredOut }
	| { ok: false; unauthenticated: boolean; error: string };

/** Items bucketed by reason group in display order; empty groups omitted. */
export function groupFilteredItems(items: readonly FilteredOutItem[]): FilteredGroup[] {
	const byGroup = new Map<FilteredReasonGroup, FilteredOutItem[]>();
	for (const item of items) {
		const list = byGroup.get(item.group);
		if (list) list.push(item);
		else byGroup.set(item.group, [item]);
	}
	return FILTERED_REASON_GROUPS.filter((group) => byGroup.has(group)).map((group) => ({
		group,
		label: FILTERED_REASON_LABEL[group],
		items: byGroup.get(group)!,
	}));
}

/** Reason summary row: label + count per non-empty group, in display order. */
export function reasonCounts(
	counts: Partial<Record<FilteredReasonGroup, number>>,
): FilteredReasonCount[] {
	return FILTERED_REASON_GROUPS.flatMap((group) => {
		const count = counts[group] ?? 0;
		return count > 0 ? [{ group, label: FILTERED_REASON_LABEL[group], count }] : [];
	});
}

export function groupHeading(label: string, count: number): string {
	return `${label} (${count})`;
}

export function showAllLabel(count: number): string {
	return `Show all (${count})`;
}

/** `Muted by: <label>` for muted items; null otherwise. */
export function mutedByLine(item: Pick<FilteredOutItem, 'mutedBy'>): string | null {
	return item.mutedBy ? `${FILTERED_MUTED_PREFIX} ${item.mutedBy.label}` : null;
}

export function duplicateOfTitle(duplicateOf: NonNullable<FilteredOutItem['duplicateOf']>): string {
	return duplicateOf.title ?? FILTERED_ARTICLE_GONE;
}

export function itemTitle(item: Pick<FilteredOutItem, 'title'>): string {
	return item.title ?? FILTERED_ARTICLE_GONE;
}

function defaultFormatTime(date: Date): string {
	return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** e.g. `Last refresh 3:40 PM: 120 candidates, 18 kept, 102 dropped`. */
export function runSummaryLine(
	run: FilteredOutRun | null,
	formatTime: (date: Date) => string = defaultFormatTime,
): string {
	if (!run) return FILTERED_NO_RUN;
	if (run.skipped) {
		const error = run.errors.find((e) => e.trim());
		return error ? `${FILTERED_SKIPPED_RUN}: ${error.trim()}` : FILTERED_SKIPPED_RUN;
	}
	const at = Date.parse(run.at);
	const when = Number.isNaN(at) ? 'Last refresh' : `Last refresh ${formatTime(new Date(at))}`;
	const candidates = `${run.candidates} ${run.candidates === 1 ? 'candidate' : 'candidates'}`;
	return `${when}: ${candidates}, ${run.kept} kept, ${run.dropped} dropped`;
}

/** Brief refresh bar link text: `N filtered out` when the last run dropped any. */
export function filteredOutLinkLabel(filteredOut: number | null | undefined): string {
	return typeof filteredOut === 'number' && Number.isFinite(filteredOut) && filteredOut > 0
		? `${filteredOut} filtered out`
		: FILTERED_LINK_LABEL;
}

function isFilteredOutBody(body: unknown): body is FilteredOut & { ok: true } {
	if (!body || typeof body !== 'object') return false;
	const b = body as Partial<FilteredOut> & { ok?: unknown };
	return (
		b.ok === true &&
		(b.scope === 'last' || b.scope === 'window') &&
		Array.isArray(b.items) &&
		!!b.counts &&
		typeof b.counts === 'object' &&
		(b.run === null || (!!b.run && typeof b.run === 'object'))
	);
}

/** Session `GET /api/triage/filtered`. */
export async function fetchFilteredOut(
	scope: FilteredOutScope,
	fetchFn: typeof fetch = fetch,
): Promise<FilteredOutResult> {
	try {
		const response = await fetchFn(`/api/triage/filtered?scope=${encodeURIComponent(scope)}`, {
			credentials: 'include',
		});
		if (response.status === 401) {
			return { ok: false, unauthenticated: true, error: FILTERED_LOGIN_HINT };
		}
		const body: unknown = await response.json().catch(() => null);
		if (response.ok && isFilteredOutBody(body)) {
			const { scope: s, run, counts, items } = body;
			return { ok: true, data: { scope: s, run, counts, items } };
		}
		const error =
			response.status < 500 && body && typeof (body as { error?: unknown }).error === 'string'
				? (body as { error: string }).error
				: FILTERED_LOAD_ERROR;
		return { ok: false, unauthenticated: false, error };
	} catch {
		return { ok: false, unauthenticated: false, error: FILTERED_LOAD_ERROR };
	}
}
