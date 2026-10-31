import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { FilteredGroup, FilteredOutItem } from '$lib/filteredOut';
import FilteredGroupSection from '../FilteredGroupSection.svelte';

const NOW = new Date('2026-10-04T16:00:00.000Z');

function item(overrides: Partial<FilteredOutItem> = {}): FilteredOutItem {
	return {
		articleId: 'astro',
		title: 'Weekly horoscope',
		url: 'https://example.com/astro',
		publisherDomain: 'example.com',
		publishedAt: '2026-10-04T12:00:00.000Z',
		sourceKind: 'rss',
		reason: 'blocklist:horoscope',
		group: 'blocklist',
		final: true,
		stage: 'blocklist',
		mutedBy: null,
		topics: [],
		duplicateOf: null,
		triagedAt: '2026-10-04T15:40:00.000Z',
		...overrides,
	};
}

function group(overrides: Partial<FilteredGroup> = {}): FilteredGroup {
	return {
		group: 'blocklist',
		label: 'Blocklist',
		items: [item()],
		...overrides,
	};
}

describe('FilteredGroupSection blocklist reason', () => {
	it('shows the exact machine reason on a blocklist item', () => {
		render(FilteredGroupSection, { props: { group: group(), now: NOW } });
		expect(screen.getByTestId('filtered-blocklist-reason')).toHaveTextContent(
			'blocklist:horoscope',
		);
	});

	it('does not add a machine-reason line to other groups', () => {
		render(FilteredGroupSection, {
			props: {
				group: group({
					group: 'muted',
					label: 'Muted',
					items: [item({ articleId: 'm', reason: 'muted:rule-1', group: 'muted' })],
				}),
				now: NOW,
			},
		});
		expect(screen.queryByTestId('filtered-blocklist-reason')).not.toBeInTheDocument();
	});
});
