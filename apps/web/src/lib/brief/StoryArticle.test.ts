import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import StoryArticle from './StoryArticle.svelte';
import type { BriefStory } from './briefClient';

const story = {
	id: 'a',
	title: 'Grid story',
	cluster_number: 1,
	informed_article_id: 'a',
	informed_summary_status: 'ok',
	short_summary: 'A summary.',
	articles: [{ title: 'The piece', link: 'https://example.com/piece', domain: 'example.com' }],
	timeline: [{ date: 'Monday', content: 'The vote' }],
	perspectives: [{ text: 'One view', sources: [{ name: 'Paper', url: 'https://example.com/p' }] }],
	quote: 'A line',
	quote_author: 'A person',
	informed_full_story_updated: 'New outlets',
	informed_full_story_status: 'ok',
} satisfies BriefStory;

describe('StoryArticle reader parity', () => {
	it('shows source links, timeline, perspective, quote, and Updated on an open card', () => {
		render(StoryArticle, {
			props: {
				story,
				storyIndex: 0,
				expanded: true,
				blurred: false,
				blurKeywords: [],
				selected: false,
				linked: false,
				shared: false,
				read: false,
				onToggle: () => {},
				onReveal: () => {},
				onReadToggle: () => {},
				onLoadFull: () => {},
				onRemoved: () => {},
			},
		});
		expect(screen.getByRole('link', { name: 'example.com' })).toHaveAttribute(
			'href',
			'https://example.com/piece',
		);
		expect(screen.getByText(/The vote/)).toBeTruthy();
		expect(screen.getByText(/One view/)).toBeTruthy();
		expect(screen.getByText('A line')).toBeTruthy();
		expect(screen.getByText('Updated: New outlets')).toBeTruthy();
	});

	it('shows the full-story loading line while a request is in flight', () => {
		render(StoryArticle, {
			props: {
				story: { ...story, informed_full_story_status: 'missing' },
				storyIndex: 0,
				expanded: true,
				blurred: false,
				blurKeywords: [],
				selected: false,
				linked: false,
				shared: false,
				read: false,
				fullPhase: { phase: 'loading' },
				onToggle: () => {},
				onReveal: () => {},
				onReadToggle: () => {},
				onLoadFull: () => {},
				onRemoved: () => {},
			},
		});
		expect(screen.getByText('Loading full story…')).toBeTruthy();
	});
});
