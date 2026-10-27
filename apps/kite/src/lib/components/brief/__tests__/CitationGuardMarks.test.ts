import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import CitationGuardMarks from '../CitationGuardMarks.svelte';
import type { InformedCitationMark } from '$lib/types';

const unverifiedLink: InformedCitationMark = {
	kind: 'url',
	status: 'missing-source',
	display: 'unverified',
	itemId: 'https://missing.example/x',
	url: 'https://missing.example/x',
};

const unverifiedQuote: InformedCitationMark = {
	kind: 'quote',
	status: 'mismatch',
	display: 'unverified',
	itemId: 'quote:paraphrase',
};

const unconfirmed: InformedCitationMark = {
	kind: 'claim',
	status: 'missing-source',
	display: 'unconfirmed',
	itemId: 'claim:abc',
};

const okMatch: InformedCitationMark = {
	kind: 'url',
	status: 'match',
	display: 'ok',
	itemId: 'https://ok.example/a',
	url: 'https://ok.example/a',
};

describe('CitationGuardMarks (NEWS-172)', () => {
	it('renders unverified link, unverified quote, and unconfirmed with advisory accessible names', async () => {
		render(CitationGuardMarks, {
			props: { marks: [unverifiedLink, unverifiedQuote, unconfirmed, okMatch] },
		});

		const details = screen.getByTestId('citation-guard-marks');
		await fireEvent.click(screen.getByText('Citation checks'));
		await tick();
		expect(details).toHaveAttribute('open');

		expect(
			screen.getByRole('button', { name: 'Unverified link (advisory)' }),
		).toBeVisible();
		expect(
			screen.getByRole('button', { name: 'Unverified quote (advisory)' }),
		).toBeVisible();
		expect(screen.getByRole('button', { name: 'Unconfirmed (advisory)' })).toBeVisible();
		expect(screen.queryByRole('button', { name: /ok/i })).not.toBeInTheDocument();
	});

	it('omits the control when every mark is display ok', () => {
		render(CitationGuardMarks, {
			props: { marks: [okMatch] },
		});
		expect(screen.queryByTestId('citation-guard-marks')).not.toBeInTheDocument();
	});

	it('exposes an advisory region and focuses a mark via keyboard', async () => {
		render(CitationGuardMarks, {
			props: { marks: [unverifiedQuote] },
		});

		const details = screen.getByTestId('citation-guard-marks');
		expect(details).not.toHaveAttribute('open');

		const summary = screen.getByText('Citation checks');
		summary.focus();
		await fireEvent.click(summary);
		await tick();
		expect(details).toHaveAttribute('open');

		expect(screen.getByRole('region', { name: 'Advisory citation marks' })).toBeVisible();

		const mark = screen.getByRole('button', { name: 'Unverified quote (advisory)' });
		mark.focus();
		expect(mark).toHaveFocus();
	});
});
