/** Copy + helpers for operator-seeded Brief stories (NEWS-66). */

export const BRIEF_SEED_ADD_LABEL = 'Add story';

export const BRIEF_SEED_MODAL_TITLE = 'Add story to Brief';

export const BRIEF_SEED_TITLE_LABEL = 'Title';

export const BRIEF_SEED_NOTE_LABEL = 'Note (optional)';

export const BRIEF_SEED_URLS_LABEL = 'URLs (optional, one per line)';

export const BRIEF_SEED_SUBMIT_LABEL = 'Add to Brief';

export const BRIEF_SEED_PENDING_LABEL = 'Saving…';

export const BRIEF_SEED_ERROR_GENERIC =
	'Could not create the story. Check the title and URLs, then try again.';

export const BRIEF_SEED_NETWORK_ERROR =
	'Network error while creating the story. Check that the server is running.';

export const BRIEF_SEED_LOGIN_HINT =
	'Session required to seed the Brief. Sign in on Radar, then try again.';

export const BRIEF_UNACCEPT_LABEL = 'Unaccept';

export const BRIEF_UNACCEPT_PENDING = 'Saving…';

export const BRIEF_UNACCEPT_ERROR =
	'Could not remove this story from the Brief. Try again.';

export type BriefSeedPayload = {
	title: string;
	note?: string;
	urls?: string[];
};

export type BriefSeedResult =
	| { ok: true; clusterId: string }
	| { ok: false; status: number; error: string; unauthenticated?: boolean };

export type BriefUnacceptResult =
	| { ok: true }
	| { ok: false; status: number; error: string; unauthenticated?: boolean };

/** Split a textarea into http(s) URL strings (blank lines ignored). */
export function parseUrlsFromTextarea(raw: string): string[] {
	return raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

export async function postBriefSeed(payload: BriefSeedPayload): Promise<BriefSeedResult> {
	try {
		const response = await fetch('/api/brief/seed', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify(payload),
		});

		const body = (await response.json().catch(() => null)) as
			| { ok?: boolean; clusterId?: string; error?: string }
			| null;

		if (response.status === 401) {
			return {
				ok: false,
				status: 401,
				error: BRIEF_SEED_LOGIN_HINT,
				unauthenticated: true,
			};
		}

		if (!response.ok || !body || body.ok === false) {
			return {
				ok: false,
				status: response.status,
				error: (body && body.error) || BRIEF_SEED_ERROR_GENERIC,
			};
		}

		return { ok: true, clusterId: body.clusterId ?? '' };
	} catch {
		return { ok: false, status: 0, error: BRIEF_SEED_NETWORK_ERROR };
	}
}

export async function postBriefUnaccept(clusterId: string): Promise<BriefUnacceptResult> {
	try {
		const response = await fetch('/api/brief/unaccept', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ clusterId }),
		});

		const body = (await response.json().catch(() => null)) as
			| { ok?: boolean; error?: string }
			| null;

		if (response.status === 401) {
			return {
				ok: false,
				status: 401,
				error: BRIEF_SEED_LOGIN_HINT,
				unauthenticated: true,
			};
		}

		if (!response.ok || (body && body.ok === false)) {
			return {
				ok: false,
				status: response.status,
				error: (body && body.error) || BRIEF_UNACCEPT_ERROR,
			};
		}

		return { ok: true };
	} catch {
		return { ok: false, status: 0, error: BRIEF_UNACCEPT_ERROR };
	}
}
