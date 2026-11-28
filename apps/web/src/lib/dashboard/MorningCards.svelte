<script lang="ts" module>
	/**
	 * The four Morning cards. A null item keeps its title and says nothing yet.
	 * An earlier local day names that short weekday. Weather draws the grid
	 * and not the body. Market shows S&P, Nasdaq, and VIX only.
	 */

	export type MorningItem = {
		id: string;
		postedAt: string;
		body: string;
		link: string | null;
		data: unknown;
	};

	export type MorningDeck = {
		bluf: MorningItem | null;
		weather: MorningItem | null;
		market: MorningItem | null;
		osint: MorningItem | null;
	};

	const CARDS = [
		{ key: 'bluf', title: 'BLUF' },
		{ key: 'weather', title: 'Weather' },
		{ key: 'market', title: 'Market' },
		{ key: 'osint', title: 'OSINT' },
	] as const;

	type MorningKey = (typeof CARDS)[number]['key'];

	type Quote = { label: string; value: number; changePct: number | null };

	type WeatherLocationView = {
		name: string;
		cells: (string | null)[];
		now: string | null;
		alert: string | null;
		note: string | null;
	};

	type WeatherGridView = { headings: string[]; locations: WeatherLocationView[] };

	type CardView = {
		title: string;
		stale: string | null;
		kind: 'empty' | MorningKey;
		body: string | null;
		grid: WeatherGridView | null;
		sp: string | null;
		nasdaq: string | null;
		vix: string | null;
		notes: string[];
		watch: string | null;
	};

	function isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	function finiteNumber(value: unknown): number | null {
		return typeof value === 'number' && Number.isFinite(value) ? value : null;
	}

	function textOrNull(value: unknown): string | null {
		return typeof value === 'string' && value.length > 0 ? value : null;
	}

	function readItem(morning: MorningDeck, key: MorningKey): MorningItem | null {
		const value: unknown = morning[key];
		if (!isRecord(value)) return null;
		if (typeof value.id !== 'string' || typeof value.postedAt !== 'string' || typeof value.body !== 'string') {
			return null;
		}
		if (value.link !== null && value.link !== undefined && typeof value.link !== 'string') return null;
		return {
			id: value.id,
			postedAt: value.postedAt,
			body: value.body,
			link: typeof value.link === 'string' ? value.link : null,
			data: value.data === undefined ? null : value.data,
		};
	}

	/** Short weekday when postedAt is an earlier local calendar day than today. */
	function earlierLocalWeekday(postedAt: string, now: Date): string | null {
		const posted = new Date(postedAt);
		if (Number.isNaN(posted.getTime())) return null;
		const year = posted.getFullYear();
		const month = posted.getMonth();
		const date = posted.getDate();
		const nowYear = now.getFullYear();
		const nowMonth = now.getMonth();
		const nowDate = now.getDate();
		const earlier =
			year < nowYear || (year === nowYear && month < nowMonth) || (year === nowYear && month === nowMonth && date < nowDate);
		if (!earlier) return null;
		return posted.toLocaleDateString(undefined, { weekday: 'short' });
	}

	/** Weekday of a YYYY-MM-DD calendar date. UTC so the date itself does not shift. */
	function calendarWeekday(day: string): string | null {
		const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
		if (match === null) return null;
		const year = Number(match[1]);
		const month = Number(match[2]);
		const date = Number(match[3]);
		const utc = new Date(Date.UTC(year, month - 1, date));
		if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== date) return null;
		return utc.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
	}

	function formatGrouped(value: number): string {
		return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	function formatChangePct(change: number): string {
		const sign = change < 0 ? '-' : '+';
		const digits = Math.abs(change).toLocaleString('en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		});
		return `${sign}${digits}%`;
	}

	function quotesOf(data: unknown): Quote[] {
		if (!isRecord(data) || !Array.isArray(data.quotes)) return [];
		const quotes: Quote[] = [];
		for (const raw of data.quotes) {
			if (!isRecord(raw)) continue;
			const label = textOrNull(raw.label);
			const value = finiteNumber(raw.value);
			if (label === null || value === null) continue;
			quotes.push({ label, value, changePct: finiteNumber(raw.changePct) });
		}
		return quotes;
	}

	function quoteByLabel(quotes: Quote[], label: string): Quote | null {
		return quotes.find((quote) => quote.label === label) ?? null;
	}

	function notesOf(data: unknown): string[] {
		if (!isRecord(data) || !Array.isArray(data.notes)) return [];
		return data.notes.filter((note): note is string => typeof note === 'string');
	}

	function spLine(quote: Quote): string {
		const value = formatGrouped(quote.value);
		if (quote.changePct === null) return `S&P ${value}`;
		return `S&P ${value} ${formatChangePct(quote.changePct)}`;
	}

	function weatherGrid(data: unknown): WeatherGridView | null {
		if (!isRecord(data) || !Array.isArray(data.days) || !Array.isArray(data.locations)) return null;
		const headings: string[] = [];
		for (const day of data.days) {
			if (typeof day !== 'string') return null;
			const heading = calendarWeekday(day);
			if (heading === null) return null;
			headings.push(heading);
		}
		const locations: WeatherLocationView[] = [];
		for (const raw of data.locations) {
			if (!isRecord(raw) || typeof raw.name !== 'string' || raw.name.length === 0) continue;
			const cells: (string | null)[] = [];
			const rawDays = Array.isArray(raw.days) ? raw.days : [];
			for (let index = 0; index < headings.length; index += 1) {
				const cell = rawDays[index];
				const high = isRecord(cell) ? finiteNumber(cell.high) : null;
				const low = isRecord(cell) ? finiteNumber(cell.low) : null;
				cells.push(high === null || low === null ? null : `${high}/${low}`);
			}
			let now: string | null = null;
			if (isRecord(raw.now)) {
				const temp = finiteNumber(raw.now.temp);
				const rain = finiteNumber(raw.now.rainChancePct);
				if (temp !== null && rain !== null && typeof raw.now.conditions === 'string') {
					now = `now ${temp}° ${raw.now.conditions} rain ${rain}% today`;
				}
			}
			const alert = textOrNull(raw.alert);
			locations.push({
				name: raw.name,
				cells,
				now,
				alert,
				note: alert === null ? textOrNull(raw.note) : null,
			});
		}
		return { headings, locations };
	}

	function watchLine(data: unknown): string | null {
		if (!isRecord(data)) return null;
		const watch = textOrNull(data.watch);
		if (watch === null) return null;
		return `Watch: ${watch}`;
	}

	function cardView(morning: MorningDeck, key: MorningKey, title: string, now: Date): CardView {
		const entry = readItem(morning, key);
		if (entry === null) {
			return {
				title,
				stale: null,
				kind: 'empty',
				body: null,
				grid: null,
				sp: null,
				nasdaq: null,
				vix: null,
				notes: [],
				watch: null,
			};
		}
		const stale = earlierLocalWeekday(entry.postedAt, now);
		switch (key) {
			case 'bluf':
				return {
					title,
					stale,
					kind: 'bluf',
					body: entry.body,
					grid: null,
					sp: null,
					nasdaq: null,
					vix: null,
					notes: [],
					watch: null,
				};
			case 'weather':
				return {
					title,
					stale,
					kind: 'weather',
					body: null,
					grid: weatherGrid(entry.data),
					sp: null,
					nasdaq: null,
					vix: null,
					notes: [],
					watch: null,
				};
			case 'market': {
				const quotes = quotesOf(entry.data);
				const sp = quoteByLabel(quotes, 'S&P');
				const nasdaq = quoteByLabel(quotes, 'Nasdaq');
				const vix = quoteByLabel(quotes, 'VIX');
				return {
					title,
					stale,
					kind: 'market',
					body: entry.body,
					grid: null,
					sp: sp === null ? null : spLine(sp),
					nasdaq:
						nasdaq === null || nasdaq.changePct === null ? null : `Nasdaq ${formatChangePct(nasdaq.changePct)}`,
					vix: vix === null ? null : `VIX ${formatGrouped(vix.value)}`,
					notes: notesOf(entry.data),
					watch: null,
				};
			}
			case 'osint':
				return {
					title,
					stale,
					kind: 'osint',
					body: entry.body,
					grid: null,
					sp: null,
					nasdaq: null,
					vix: null,
					notes: [],
					watch: watchLine(entry.data),
				};
			default: {
				const unexpected: never = key;
				return unexpected;
			}
		}
	}

	function viewsFor(morning: MorningDeck, now: Date): CardView[] {
		return CARDS.map((card) => cardView(morning, card.key, card.title, now));
	}
</script>

<script lang="ts">
	interface Props {
		morning: MorningDeck;
	}

	let { morning }: Props = $props();

	const views = $derived(viewsFor(morning, new Date()));
</script>

<div class="row">
{#each views as view (view.title)}
	<section>
		<h3>{view.title}</h3>
		{#if view.kind === 'empty'}
			<p>nothing yet</p>
		{:else}
			{#if view.stale !== null}
				<p>latest on file: {view.stale}</p>
			{/if}
			{#if view.kind === 'bluf' && view.body !== null}
				<p>{view.body}</p>
			{:else if view.kind === 'weather' && view.grid !== null}
				<table>
					<thead>
						<tr>
							<td></td>
							{#each view.grid.headings as heading, index (index)}
								<th scope="col">{heading}</th>
							{/each}
						</tr>
					</thead>
					{#each view.grid.locations as location, index (`${location.name}-${index}`)}
						<tbody>
							<tr>
								<th scope="row">{location.name}</th>
								{#each location.cells as cell, cellIndex (`${location.name}-${cellIndex}`)}
									<td>{cell ?? ''}</td>
								{/each}
							</tr>
							{#if location.now !== null || location.alert !== null || location.note !== null}
								<tr>
									<td colspan={view.grid.headings.length + 1}>
										{#if location.now !== null}
											<p>{location.now}</p>
										{/if}
										{#if location.alert !== null}
											<p data-tone="alert" style="color: #c4841d">{location.alert}</p>
										{:else if location.note !== null}
											<p>{location.note}</p>
										{/if}
									</td>
								</tr>
							{/if}
						</tbody>
					{/each}
				</table>
			{:else if view.kind === 'market'}
				{#if view.body !== null}
					<p>{view.body}</p>
				{/if}
				{#if view.sp !== null}
					<p>{view.sp}</p>
				{/if}
				{#if view.nasdaq !== null}
					<p>{view.nasdaq}</p>
				{/if}
				{#if view.vix !== null}
					<p>{view.vix}</p>
				{/if}
				{#each view.notes as note, index (`note-${index}`)}
					<p>{note}</p>
				{/each}
			{:else if view.kind === 'osint'}
				{#if view.body !== null}
					<p>{view.body}</p>
				{/if}
				{#if view.watch !== null}
					<p>{view.watch}</p>
				{/if}
			{/if}
		{/if}
	</section>
{/each}
</div>

<style>
	.row {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	section {
		min-width: 0;
		padding: 0 0.9rem;
		border-left: 1px solid #2c3038;
	}

	section:first-child {
		padding-left: 0;
		border-left: 0;
	}

	h3 {
		font-family: var(--font-mono);
		margin: 0 0 0.45rem;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9c978c;
	}

	p {
		margin: 0.2rem 0;
	}

	table {
		border-collapse: collapse;
		font-size: 0.8rem;
		color: #d9d4c8;
	}

	th,
	td {
		padding: 0.15rem 0.35rem 0.15rem 0;
		font-weight: 500;
		text-align: left;
	}

	[data-tone='alert'] {
		color: #c4841d;
	}

	@media (max-width: 52rem) {
		.row {
			grid-template-columns: 1fr 1fr;
		}

		section:nth-child(odd) {
			padding-left: 0;
			border-left: 0;
		}
	}
</style>
