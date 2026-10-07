import { redirect } from '@sveltejs/kit';

/** Radar retired (NEWS-91): old bookmarks land on Topics. Query string is not forwarded. */
export function load(): never {
	redirect(307, '/topics');
}
