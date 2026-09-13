import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import locales from '$lib/locales';

/**
 * Serve bundled locales with Informed News brand overrides (NEWS-45).
 * Do not proxy to kite.kagi.com — that would reintroduce Kagi chrome strings.
 */
export const GET: RequestHandler = async ({ params }) => {
	const requested = params.lang || 'en';
	const localeKey = requested in locales ? requested : 'en';
	const strings = locales[localeKey] ?? locales.en;

	return json({
		locale: localeKey,
		strings,
	});
};
