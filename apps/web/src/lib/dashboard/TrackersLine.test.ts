import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import TrackersLine, { type TrackerStory, type TrackerWeather, type Trackers } from './TrackersLine.svelte';

/** Non-empty text nodes, so a chip title is not glued to the next chip. */
function textNodes(element: HTMLElement): string[] {
	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
	const found: string[] = [];
	let current = walker.nextNode();
	while (current) {
		const value = (current.textContent ?? '').trim();
		if (value) found.push(value);
		current = walker.nextNode();
	}
	return found;
}

function renderLine(trackers: Trackers) {
	const region = render(TrackersLine, { props: { trackers } }).container.firstElementChild;
	if (!(region instanceof HTMLElement)) throw new Error('missing trackers line');
	return within(region);
}

afterEach(() => {
	cleanup();
});

describe('TrackersLine', () => {
	it('shows zero trackers and no chips when there are no stories and weather is null', () => {
		const root = renderLine({ stories: [], weather: null });

		expect(root.getByText('0 trackers have news')).toBeVisible();
		expect(root.queryByText(/\+/)).not.toBeInTheDocument();
	});

	it('shows three trackers, story chips in order, Weather +1, and no links or CFP', () => {
		const stories: TrackerStory[] = [
			{ id: 's1', title: 'Iran talks', newCount: 2 },
			{ id: 's2', title: 'Grid', newCount: 1 },
		];
		const weather: TrackerWeather = { newCount: 1 };
		const root = renderLine({ stories, weather });

		expect(root.getByText('3 trackers have news')).toBeVisible();
		expect(root.getByText('Iran talks +2')).toBeVisible();
		expect(root.getByText('Grid +1')).toBeVisible();
		expect(root.getByText('Weather +1')).toBeVisible();
		expect(root.queryByRole('link')).not.toBeInTheDocument();
		expect(screen.queryByText(/CFP/i)).not.toBeInTheDocument();

		const chips = root.getAllByRole('listitem');
		expect(chips).toHaveLength(3);
		expect(chips[0]).toHaveTextContent('Iran talks +2');
		expect(chips[1]).toHaveTextContent('Grid +1');
		expect(chips[2]).toHaveTextContent('Weather +1');
		expect(textNodes(root.getByRole('list'))).toEqual(['Iran talks +2', 'Grid +1', 'Weather +1']);
		expect(root.getByRole('list')).toHaveStyle({ gap: '0.75rem' });
	});

	it('shows one tracker and no Weather chip when weather is null', () => {
		const stories: TrackerStory[] = [{ id: 's1', title: 'Iran talks', newCount: 1 }];
		const root = renderLine({ stories, weather: null });

		expect(root.getByText('1 tracker has news')).toBeVisible();
		expect(root.getByText('Iran talks +1')).toBeVisible();
		expect(root.queryByText('Weather +1')).not.toBeInTheDocument();
	});
});