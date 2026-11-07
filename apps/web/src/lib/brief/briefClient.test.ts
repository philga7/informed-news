import { describe, expect, it } from 'vitest';
import { sharedHrefVisit } from './briefClient';

const missingHref = '/latest/world/99?shared=1';

describe('sharedHrefVisit', () => {
	it('clears the latch when the shared story is missing so the same href runs again', () => {
		const first = sharedHrefVisit(missingHref, '', false);
		expect(first).toEqual({ action: 'missing', latch: '' });
		if (first.action !== 'missing') return;
		// replaceState does not change page.url. The next click is a real navigation
		// of the same href, and an uncleared latch would skip it.
		const again = sharedHrefVisit(missingHref, first.latch, false);
		expect(again).toEqual({ action: 'missing', latch: '' });
	});

	it('keeps the latch when the story is found so a later stories update does not re-enter', () => {
		const href = '/latest/world/1?shared=1';
		const first = sharedHrefVisit(href, '', true);
		expect(first).toEqual({ action: 'found', latch: href });
		if (first.action !== 'found') return;
		expect(sharedHrefVisit(href, first.latch, true)).toEqual({ action: 'skip' });
	});
});
