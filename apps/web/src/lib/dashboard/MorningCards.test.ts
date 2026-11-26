import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MorningCards from './MorningCards.svelte';

const NOW = new Date('2026-11-26T15:00:00.000Z');

type MorningItem = {
	id: string;
	postedAt: string;
	body: string;
	link: string | null;
	data: unknown;
};

type Morning = {
	bluf: MorningItem | null;
	weather: MorningItem | null;
	market: MorningItem | null;
	osint: MorningItem | null;
};

function localNoon(dayOffset: number): string {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, 12, 0, 0, 0).toISOString();
}

/** Short weekday of a local calendar day, as the latest-on-file line specifies. */
function localWeekday(dayOffset: number): string {
	const now = new Date();
	const local = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, 12, 0, 0, 0);
	return local.toLocaleDateString(undefined, { weekday: 'short' });
}

/** Short weekday of a date-only string, pinned to the UTC calendar date. */
function utcWeekday(day: string): string {
	return new Date(`${day}T00:00:00.000Z`).toLocaleDateString(undefined, {
		weekday: 'short',
		timeZone: 'UTC',
	});
}

function item(partial: Partial<MorningItem> & Pick<MorningItem, 'id' | 'body'>): MorningItem {
	return {
		postedAt: localNoon(0),
		link: null,
		data: null,
		...partial,
	};
}

function renderCards(morning: Partial<Morning> = {}) {
	return render(MorningCards, {
		props: {
			morning: {
				bluf: null,
				weather: null,
				market: null,
				osint: null,
				...morning,
			},
		},
	});
}

function block(name: string) {
	const heading = screen.getByRole('heading', { name });
	const region = heading.parentElement;
	if (!(region instanceof HTMLElement)) throw new Error(`missing block for ${name}`);
	return within(region);
}

function follows(earlier: HTMLElement, later: HTMLElement): void {
	expect(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
		Node.DOCUMENT_POSITION_FOLLOWING,
	);
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('MorningCards', () => {
	it('says nothing yet for a null BLUF, names an earlier local day, and skips latest on file for today', () => {
		renderCards();

		expect(block('BLUF').getByText('nothing yet')).toBeVisible();
		expect(block('Weather').getByText('nothing yet')).toBeVisible();
		expect(block('Market').getByText('nothing yet')).toBeVisible();
		expect(block('OSINT').getByText('nothing yet')).toBeVisible();
		follows(screen.getByRole('heading', { name: 'BLUF' }), screen.getByRole('heading', { name: 'Weather' }));
		follows(screen.getByRole('heading', { name: 'Weather' }), screen.getByRole('heading', { name: 'Market' }));
		follows(screen.getByRole('heading', { name: 'Market' }), screen.getByRole('heading', { name: 'OSINT' }));

		cleanup();
		renderCards({
			bluf: item({ id: 'bluf-earlier', body: 'Yesterday lead', postedAt: localNoon(-1) }),
		});

		expect(localWeekday(-1)).toBe('Wed');
		expect(block('BLUF').getByText('latest on file: Wed')).toBeVisible();
		expect(block('BLUF').getByText('Yesterday lead')).toBeVisible();
		expect(block('BLUF').queryByText('nothing yet')).not.toBeInTheDocument();

		cleanup();
		renderCards({
			bluf: item({ id: 'bluf-today', body: 'Today lead', postedAt: localNoon(0) }),
		});

		expect(block('BLUF').getByText('Today lead')).toBeVisible();
		expect(screen.queryByText(/latest on file/)).not.toBeInTheDocument();
		expect(block('BLUF').queryByText('nothing yet')).not.toBeInTheDocument();
	});

	it('says nothing yet when a card key is missing', () => {
		render(MorningCards, {
			props: {
				morning: { weather: null, market: null, osint: null } as Morning,
			},
		});

		expect(block('BLUF').getByText('nothing yet')).toBeVisible();
	});

	it('shows the weather grid and an alert, and keeps the note only when there is no alert', () => {
		renderCards({
			weather: item({
				id: 'weather-1',
				body: 'NWS discussion stays off the card',
				postedAt: localNoon(0),
				data: {
					unit: 'F',
					issuedAt: '2026-11-26T06:32:00-05:00',
					alertsAt: '2026-11-25T21:59:00-05:00',
					days: ['2026-11-26', '2026-11-27'],
					locations: [
						{
							name: 'Dahlonega',
							now: { temp: 53, conditions: 'clear', rainChancePct: 16 },
							days: [
								{ high: 57, low: 51 },
								{ high: 51, low: 40 },
							],
							alert: 'Freeze Watch: lows to 29, 2-8 AM Sat',
							note: 'NWS frost line stays hidden',
						},
						{
							name: 'Jefferson',
							days: [
								{ high: 64, low: 54 },
								{ high: 60, low: 42 },
							],
							note: 'Frost in the valleys',
						},
					],
				},
			}),
		});

		expect(utcWeekday('2026-11-26')).toBe('Thu');
		expect(utcWeekday('2026-11-27')).toBe('Fri');
		const weather = block('Weather');
		expect(weather.getByText('Thu')).toBeVisible();
		expect(weather.getByText('Fri')).toBeVisible();
		expect(weather.getByText('Dahlonega')).toBeVisible();
		expect(weather.getByText('57/51')).toBeVisible();
		expect(weather.getByText('51/40')).toBeVisible();
		expect(weather.getByText('now 53° clear rain 16% today')).toBeVisible();
		expect(weather.getByText('Jefferson')).toBeVisible();
		expect(weather.getByText('64/54')).toBeVisible();
		expect(weather.getByText('60/42')).toBeVisible();

		const alert = weather.getByText('Freeze Watch: lows to 29, 2-8 AM Sat');
		expect(alert).toHaveAttribute('data-tone', 'alert');
		expect(alert).toHaveStyle({ color: '#c4841d' });
		expect(document.querySelectorAll('[data-tone="alert"]')).toHaveLength(1);

		expect(weather.queryByText('NWS frost line stays hidden')).not.toBeInTheDocument();
		const note = weather.getByText('Frost in the valleys');
		expect(note).toBeVisible();
		expect(note).not.toHaveAttribute('data-tone', 'alert');
		expect(weather.queryByText('NWS discussion stays off the card')).not.toBeInTheDocument();
		expect(screen.queryByText('2026-11-26T06:32:00-05:00')).not.toBeInTheDocument();
	});

	it('puts the Freeze Watch with Dahlonega and the note with Jefferson', () => {
		renderCards({
			weather: item({
				id: 'weather-1',
				body: 'NWS discussion stays off the card',
				postedAt: localNoon(0),
				data: {
					unit: 'F',
					issuedAt: '2026-11-26T06:32:00-05:00',
					alertsAt: '2026-11-25T21:59:00-05:00',
					days: ['2026-11-26', '2026-11-27'],
					locations: [
						{
							name: 'Dahlonega',
							now: { temp: 53, conditions: 'clear', rainChancePct: 16 },
							days: [
								{ high: 57, low: 51 },
								{ high: 51, low: 40 },
							],
							alert: 'Freeze Watch: lows to 29, 2-8 AM Sat',
							note: 'NWS frost line stays hidden',
						},
						{
							name: 'Jefferson',
							days: [
								{ high: 64, low: 54 },
								{ high: 60, low: 42 },
							],
							note: 'Frost in the valleys',
						},
					],
				},
			}),
		});

		const weather = block('Weather');
		const dahlonega = weather.getByRole('rowheader', { name: 'Dahlonega' });
		const jefferson = weather.getByRole('rowheader', { name: 'Jefferson' });
		const dahlonegaBlock = dahlonega.closest('tbody');
		const jeffersonBlock = jefferson.closest('tbody');
		if (!(dahlonegaBlock instanceof HTMLElement) || !(jeffersonBlock instanceof HTMLElement)) {
			throw new Error('missing location block');
		}
		expect(dahlonegaBlock).not.toBe(jeffersonBlock);
		expect(within(dahlonegaBlock).getByText('Freeze Watch: lows to 29, 2-8 AM Sat')).toBeVisible();
		expect(within(dahlonegaBlock).getByText('now 53° clear rain 16% today')).toBeVisible();
		expect(within(dahlonegaBlock).queryByText('Frost in the valleys')).not.toBeInTheDocument();
		expect(within(jeffersonBlock).getByText('Frost in the valleys')).toBeVisible();
		expect(within(jeffersonBlock).queryByText(/Freeze Watch/)).not.toBeInTheDocument();
		expect(within(jeffersonBlock).queryByText('now 53° clear rain 16% today')).not.toBeInTheDocument();
	});

	it('shows S&P value and change, Nasdaq change, VIX value, the body, and the notes', () => {
		renderCards({
			market: item({
				id: 'market-1',
				body: 'Markets mixed',
				postedAt: localNoon(0),
				data: {
					quotes: [
						{ label: 'Oil', value: 71.5, changePct: 3.25 },
						{ value: 9999.5, changePct: 9.99 },
						{ label: 'VIX', value: 18, changePct: 1.5 },
						{ label: 'Nasdaq', value: 23110.4, changePct: 0.25 },
						{ label: 'S&P', value: 7520.93, changePct: -0.38 },
					],
					notes: ['Needs attention: SPG, RSI 79.6, trim candidate.', 'feed: CME settlement'],
				},
			}),
		});

		const market = block('Market');
		const body = market.getByText('Markets mixed');
		const sp = market.getByText('S&P 7,520.93 -0.38%');
		const nasdaq = market.getByText('Nasdaq +0.25%');
		const vix = market.getByText('VIX 18.00');
		const attention = market.getByText('Needs attention: SPG, RSI 79.6, trim candidate.');
		const feed = market.getByText('feed: CME settlement');

		follows(body, sp);
		follows(sp, nasdaq);
		follows(nasdaq, vix);
		follows(vix, attention);
		follows(attention, feed);

		expect(nasdaq).not.toHaveTextContent('23,110.40');
		expect(nasdaq).not.toHaveTextContent('23110');
		expect(vix).not.toHaveTextContent('%');
		expect(screen.queryByText('Oil')).not.toBeInTheDocument();
		expect(screen.queryByText(/71\.50/)).not.toBeInTheDocument();
		expect(screen.queryByText(/\+3\.25%/)).not.toBeInTheDocument();
		expect(screen.queryByText(/23,110\.40/)).not.toBeInTheDocument();
		expect(screen.queryByText(/23110/)).not.toBeInTheDocument();
		expect(screen.queryByText(/\+1\.50%/)).not.toBeInTheDocument();
		expect(screen.queryByText(/9,999\.50/)).not.toBeInTheDocument();
		expect(screen.queryByText(/\+9\.99%/)).not.toBeInTheDocument();
		expect(screen.getAllByText(/feed:/)).toHaveLength(1);
	});

	it('shows the OSINT body and Watch line, and omits Watch when it is missing', () => {
		renderCards({
			osint: item({
				id: 'osint-watch',
				body: 'Overnight collection',
				data: { watch: 'Whether US aircraft return to UK bases.' },
			}),
		});

		expect(block('OSINT').getByText('Overnight collection')).toBeVisible();
		expect(block('OSINT').getByText('Watch: Whether US aircraft return to UK bases.')).toBeVisible();

		cleanup();
		renderCards({
			osint: item({ id: 'osint-null', body: 'Quiet night', data: null }),
		});

		expect(block('OSINT').getByText('Quiet night')).toBeVisible();
		expect(screen.queryByText(/Watch:/)).not.toBeInTheDocument();

		cleanup();
		renderCards({
			osint: item({ id: 'osint-empty', body: 'No line', data: {} }),
		});

		expect(block('OSINT').getByText('No line')).toBeVisible();
		expect(screen.queryByText(/Watch:/)).not.toBeInTheDocument();

		cleanup();
		renderCards({
			osint: item({ id: 'osint-blank', body: 'Blank watch', data: { watch: '' } }),
		});

		expect(block('OSINT').getByText('Blank watch')).toBeVisible();
		expect(screen.queryByText(/Watch:/)).not.toBeInTheDocument();
	});
});
