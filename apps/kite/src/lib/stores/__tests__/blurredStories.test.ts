import { describe, expect, it } from 'vitest';
import { blurredStories, selectedStoryAnnouncement } from '../blurredStories.svelte';

describe('selectedStoryAnnouncement (NEWS-143)', () => {
	it('names an unblurred story by its title', () => {
		expect(selectedStoryAnnouncement('Port workers reach tentative agreement')).toBe(
			'Selected story: Port workers reach tentative agreement',
		);
	});

	it('names a blurred story by the filter keywords it matches, never its title', () => {
		expect(selectedStoryAnnouncement('Battery storage', ['battery'])).toBe(
			'Selected story: filtered (matches "battery")',
		);
		expect(selectedStoryAnnouncement('Battery storage', ['battery', 'storage'])).toBe(
			'Selected story: filtered (matches "battery", "storage")',
		);
		expect(selectedStoryAnnouncement('Battery storage', [])).toBe('Selected story: filtered');
	});
});

describe('blurredStories (NEWS-143)', () => {
	const noop = () => {};

	it('holds a blurred card until it unregisters', () => {
		const card = { keywords: ['battery'], reveal: noop };
		const unregister = blurredStories.register('a', card);
		expect(blurredStories.get('a')).toBe(card);
		unregister();
		expect(blurredStories.get('a')).toBeUndefined();
	});

	it("a stale unregister leaves a newer card's registration in place", () => {
		const unregisterOld = blurredStories.register('b', { keywords: ['old'], reveal: noop });
		const current = { keywords: ['new'], reveal: noop };
		const unregisterCurrent = blurredStories.register('b', current);
		unregisterOld();
		expect(blurredStories.get('b')).toBe(current);
		unregisterCurrent();
	});
});
