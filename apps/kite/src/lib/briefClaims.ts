export type BriefClaimVerbiage = {
	short_summary: string;
	talking_points: string[];
};

export type BriefClaimLinkedHeadline = {
	id: string;
	title: string;
	sourceKind: string;
	publisherDomain: string | null;
	publishedAt: string | null;
	canonicalUrl: string;
	sourceTier: 'primary' | 'sensor';
	stance: 'supports' | 'contradicts' | 'mentions';
};

export type BriefClaimItem = {
	claimId: string;
	text: string;
	claimType: string;
	status: string;
	createdAt: string;
	confidence: number | null;
	evidence: {
		total: number;
		supports: number;
		contradicts: number;
		mentions: number;
		primary: number;
		sensor: number;
	};
	clusterKeys: string[];
	linkedHeadlines: BriefClaimLinkedHeadline[];
	verbiage: BriefClaimVerbiage | null;
};

export type BriefClaimsResponse =
	| {
			ok: true;
			claims: BriefClaimItem[];
	  }
	| {
			ok: false;
			error: string;
	  };

export const BRIEF_CLAIMS_SECTION_TITLE = 'Accepted claims';
export const BRIEF_STORIES_SECTION_TITLE = 'Accepted stories';
export const BRIEF_CLAIMS_EMPTY_COPY = 'No accepted claims yet. Accept on Radar.';
export const BRIEF_CLAIMS_LOAD_ERROR = 'Could not load accepted claims. Try again.';
export const BRIEF_CLAIMS_UNACCEPT_LABEL = 'Unaccept';
export const BRIEF_CLAIMS_UNACCEPT_PENDING = 'Saving…';
export const BRIEF_CLAIMS_UNACCEPT_ERROR =
	'Could not remove this claim from the Brief. Try again.';
export const BRIEF_CLAIMS_LOGIN_HINT =
	'Session required to update accepted claims. Sign in on Radar, then try again.';
export const BRIEF_CLAIMS_SHOW_HEADLINES = 'Show linked headlines';
export const BRIEF_CLAIMS_HIDE_HEADLINES = 'Hide linked headlines';
export const BRIEF_CLAIMS_LINKED_HEADLINES_LABEL = 'Linked headlines';

export type BriefClaimUnacceptResult =
	| { ok: true }
	| { ok: false; status: number; error: string; unauthenticated?: boolean };

export function humanizeClaimLabel(value: string): string {
	if (!value) return '';
	return value
		.replace(/[_-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatClaimConfidence(value: number | null): string {
	if (value === null || value === undefined) return '—';
	if (!Number.isFinite(value)) return '—';
	return `${Math.round(value * 100)}%`;
}

export function formatClaimDateTime(value: string | null): string {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	});
}

export async function postClaimUnaccept(claimId: string): Promise<BriefClaimUnacceptResult> {
	try {
		const response = await fetch('/api/claims/unaccept', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ claimId }),
		});

		const body = (await response.json().catch(() => null)) as
			| { ok?: boolean; error?: string }
			| null;

		if (response.status === 401) {
			return {
				ok: false,
				status: 401,
				error: BRIEF_CLAIMS_LOGIN_HINT,
				unauthenticated: true,
			};
		}

		if (!response.ok || (body && body.ok === false)) {
			return {
				ok: false,
				status: response.status,
				error: (body && body.error) || BRIEF_CLAIMS_UNACCEPT_ERROR,
			};
		}

		return { ok: true };
	} catch {
		return { ok: false, status: 0, error: BRIEF_CLAIMS_UNACCEPT_ERROR };
	}
}
