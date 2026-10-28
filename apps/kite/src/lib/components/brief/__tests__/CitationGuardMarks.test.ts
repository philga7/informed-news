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

	describe('court marks (NEWS-173)', () => {
		const unresolvedCourt: InformedCitationMark = {
			kind: 'court',
			status: 'missing-source',
			display: 'unverified',
			itemId: 'court:1',
			url: 'https://www.courtlistener.com/opinion/1/a-v-b/',
		};
		const procedural: InformedCitationMark = {
			kind: 'court',
			status: 'match',
			display: 'ok',
			itemId: 'court:2',
			url: 'https://www.courtlistener.com/opinion/2/c-v-d/',
			procedural: true,
		};

		async function openPanel() {
			await fireEvent.click(screen.getByText('Citation checks'));
			await tick();
		}

		it('labels an unresolved court cite Unverified citation with an advisory name', async () => {
			render(CitationGuardMarks, { props: { marks: [unresolvedCourt] } });
			await openPanel();
			const btn = screen.getByRole('button', { name: 'Unverified citation (advisory)' });
			expect(btn).toHaveTextContent('Unverified citation');
		});

		it('shows the procedural note even when display is ok, visible and in the name', async () => {
			render(CitationGuardMarks, { props: { marks: [procedural] } });
			await openPanel();
			const btn = screen.getByRole('button', {
				name: 'Dismissed on procedure, not on the merits (advisory)',
			});
			expect(btn).toHaveTextContent('Dismissed on procedure, not on the merits');
		});

		it('renders the CourtListener record link only when it differs from the url', async () => {
			const withRecord: InformedCitationMark = {
				...unresolvedCourt,
				courtRecordUrl: 'https://www.courtlistener.com/docket/9/x/',
			};
			const same: InformedCitationMark = {
				...unresolvedCourt,
				itemId: 'court:3',
				courtRecordUrl: unresolvedCourt.url,
			};
			const { unmount } = render(CitationGuardMarks, { props: { marks: [withRecord] } });
			await openPanel();
			await fireEvent.click(screen.getByRole('button', { name: 'Unverified citation (advisory)' }));
			const link = screen.getByRole('link', { name: 'CourtListener record' });
			expect(link).toHaveAttribute('href', 'https://www.courtlistener.com/docket/9/x/');
			unmount();

			render(CitationGuardMarks, { props: { marks: [same] } });
			await openPanel();
			await fireEvent.click(screen.getByRole('button', { name: 'Unverified citation (advisory)' }));
			expect(screen.queryByRole('link', { name: 'CourtListener record' })).not.toBeInTheDocument();
		});

		it('exposes aria-expanded that flips on click and shows the detail sentence', async () => {
			render(CitationGuardMarks, { props: { marks: [unresolvedCourt] } });
			await openPanel();
			const btn = screen.getByRole('button', { name: 'Unverified citation (advisory)' });
			expect(btn).toHaveAttribute('aria-expanded', 'false');
			expect(btn).toHaveAttribute('aria-controls');
			await fireEvent.click(btn);
			expect(btn).toHaveAttribute('aria-expanded', 'true');
			expect(
				screen.getByText('This did not match a source from this run.'),
			).toBeVisible();
		});
	});
});
