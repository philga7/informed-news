<script lang="ts" module>
	/**
	 * Developing and quiet rows for the home shell, plus category chips,
	 * follow / hide, and the hidden foot.
	 */

	export type StoryRole = 'hub' | 'branch';
	export type StoryStatus = 'developing' | 'active' | 'stalled' | 'waiting';
	export type EntryPrecision = 'time' | 'day' | null;

	export type StoryCategoryRef = { id: string; name: string };

	export type DashboardStory = {
		id: string;
		title: string;
		role: StoryRole;
		status: StoryStatus;
		nowSummary: string | null;
		latestEntryAt: string | null;
		latestEntryPrecision: EntryPrecision;
		newCount: number;
		readUpTo: string | null;
		categories: StoryCategoryRef[];
		followState: 'follow' | null;
		hubTitle: string | null;
		private: boolean;
	};

	export type DashboardCategory = { id: string; name: string; count: number };
	export type HiddenStory = { id: string; title: string };

	function isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	function isCategoryRef(value: unknown): value is StoryCategoryRef {
		return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
	}

	export function isDashboardStory(value: unknown): value is DashboardStory {
		if (!isRecord(value)) return false;
		if (typeof value.id !== 'string' || typeof value.title !== 'string') return false;
		if (value.role !== 'hub' && value.role !== 'branch') return false;
		if (
			value.status !== 'developing' &&
			value.status !== 'active' &&
			value.status !== 'stalled' &&
			value.status !== 'waiting'
		) {
			return false;
		}
		if (typeof value.nowSummary !== 'string' && value.nowSummary !== null) return false;
		if (typeof value.latestEntryAt !== 'string' && value.latestEntryAt !== null) return false;
		if (
			value.latestEntryPrecision !== 'time' &&
			value.latestEntryPrecision !== 'day' &&
			value.latestEntryPrecision !== null
		) {
			return false;
		}
		if (typeof value.newCount !== 'number' || !Number.isFinite(value.newCount)) return false;
		if (typeof value.readUpTo !== 'string' && value.readUpTo !== null) return false;
		if (!Array.isArray(value.categories) || !value.categories.every(isCategoryRef)) return false;
		if (value.followState !== 'follow' && value.followState !== null) return false;
		if (typeof value.hubTitle !== 'string' && value.hubTitle !== null) return false;
		if (typeof value.private !== 'boolean') return false;
		return true;
	}

	export function isDashboardCategory(value: unknown): value is DashboardCategory {
		return (
			isRecord(value) &&
			typeof value.id === 'string' &&
			typeof value.name === 'string' &&
			typeof value.count === 'number' &&
			Number.isFinite(value.count)
		);
	}

	export function isHiddenStory(value: unknown): value is HiddenStory {
		return isRecord(value) && typeof value.id === 'string' && typeof value.title === 'string';
	}

	function statusWord(status: StoryStatus): string {
		switch (status) {
			case 'developing':
				return 'Developing';
			case 'active':
				return 'Active';
			case 'stalled':
				return 'Stalled';
			case 'waiting':
				return 'Waiting';
			default: {
				const unexpected: never = status;
				return unexpected;
			}
		}
	}

	function localTime(iso: string): string {
		return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	}

	function utcMonthDay(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC',
		});
	}

	/** Relative phrase for a timed entry. A day-precision entry does not use this. */
	function relativePhrase(iso: string, nowMs: number): string {
		const delta = nowMs - new Date(iso).getTime();
		const minute = 60_000;
		const hour = 60 * minute;
		const day = 24 * hour;
		if (delta < minute) return 'just now';
		if (delta < hour) return `${Math.floor(delta / minute)} min ago`;
		if (delta < day) return `${Math.floor(delta / hour)} h ago`;
		const days = Math.floor(delta / day);
		if (days === 1) return '1 day ago';
		return `${days} days ago`;
	}

	function readUpToLine(iso: string): string {
		const weekday = new Date(iso).toLocaleDateString(undefined, { weekday: 'short' });
		return `read up to ${weekday} ${localTime(iso)}`;
	}

	type EntryLine = { kind: 'time'; clock: string; relative: string } | { kind: 'day'; label: string };

	function entryLine(row: DashboardStory, nowMs: number): EntryLine | null {
		if (row.latestEntryAt === null) return null;
		switch (row.latestEntryPrecision) {
			case 'time':
				return {
					kind: 'time',
					clock: localTime(row.latestEntryAt),
					relative: relativePhrase(row.latestEntryAt, nowMs),
				};
			case 'day':
				return { kind: 'day', label: utcMonthDay(row.latestEntryAt) };
			case null:
				return null;
			default: {
				const unexpected: never = row.latestEntryPrecision;
				return unexpected;
			}
		}
	}

	function followWord(row: DashboardStory): 'Follow' | 'Following' {
		return row.followState === 'follow' ? 'Following' : 'Follow';
	}
</script>

<script lang="ts">
	interface Props {
		developing: DashboardStory[];
		quiet: DashboardStory[];
		categories: DashboardCategory[];
		hidden: HiddenStory[];
		hasAccount: boolean;
		onReload: () => void;
	}

	let { developing, quiet, categories, hidden, hasAccount, onReload }: Props = $props();

	const uid = $props.id();

	let selectedCategoryId = $state<string | null>(null);
	let hiddenOpen = $state(false);

	const developingShown = $derived(
		selectedCategoryId === null
			? developing
			: developing.filter((row) => row.categories.some((category) => category.id === selectedCategoryId)),
	);
	const quietShown = $derived(
		selectedCategoryId === null
			? quiet
			: quiet.filter((row) => row.categories.some((category) => category.id === selectedCategoryId)),
	);
	const empty = $derived(developing.length === 0 && quiet.length === 0);

	async function send(method: 'PUT' | 'DELETE', id: string, state?: 'follow' | 'hide'): Promise<void> {
		try {
			const res = await fetch(`/api/stories/${encodeURIComponent(id)}/follow-state`, {
				method,
				credentials: 'include',
				...(method === 'PUT'
					? {
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ state }),
						}
					: {}),
			});
			if (res.ok) onReload();
		} catch {
			// Leave the rows as the last dashboard read painted them.
		}
	}

	function onFollow(row: DashboardStory): void {
		if (row.followState === 'follow') {
			void send('DELETE', row.id);
			return;
		}
		void send('PUT', row.id, 'follow');
	}

	function onHide(row: DashboardStory): void {
		void send('PUT', row.id, 'hide');
	}

	function onUnhide(id: string): void {
		void send('DELETE', id);
	}

	function rowDomId(id: string): string {
		return `${uid}-${id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
	}
</script>

{#snippet storyRow(row: DashboardStory)}
	{@const line = entryLine(row, Date.now())}
	<article aria-labelledby={rowDomId(row.id)}>
		<p class="kicker">
			<span>{statusWord(row.status)}</span>
			{#if row.role === 'branch'}
				<span>Branch</span>
			{/if}
			{#if row.newCount > 0}
				<span class="count">+{row.newCount} new</span>
			{/if}
		</p>
		<p class="title" id={rowDomId(row.id)}>{row.title}</p>
		{#if row.private}
			<p class="meta">Private</p>
		{/if}
		{#if row.hubTitle !== null}
			<p class="part">part of {row.hubTitle}</p>
		{/if}
		{#if row.nowSummary !== null}
			<p class="now">{row.nowSummary}</p>
		{/if}
		{#if line?.kind === 'time'}
			<p class="meta">{line.clock} {line.relative}</p>
		{:else if line?.kind === 'day'}
			<p class="meta">{line.label}</p>
		{/if}
		{#if row.readUpTo !== null}
			<p class="meta">{readUpToLine(row.readUpTo)}</p>
		{/if}
		{#if hasAccount}
			<p class="actions">
				<button type="button" onclick={() => onFollow(row)}>{followWord(row)}</button>
				<span> · </span>
				<button type="button" onclick={() => onHide(row)}>Hide</button>
			</p>
		{/if}
	</article>
{/snippet}

{#if empty}
	<p>nothing yet</p>
{:else}
	<div class="chips" role="group" aria-label="Categories">
		<button
			type="button"
			aria-pressed={selectedCategoryId === null ? 'true' : 'false'}
			onclick={() => (selectedCategoryId = null)}
		>
			All
		</button>
		{#each categories as category (category.id)}
			<button
				type="button"
				aria-pressed={selectedCategoryId === category.id ? 'true' : 'false'}
				onclick={() => (selectedCategoryId = category.id)}
			>
				{category.name} {category.count}
			</button>
		{/each}
	</div>
	{#each developingShown as row (row.id)}
		{@render storyRow(row)}
	{/each}
	{#if quietShown.length > 0}
		<h3 class="quiet">Quiet</h3>
		{#each quietShown as row (row.id)}
			{@render storyRow(row)}
		{/each}
	{/if}
{/if}

{#if hasAccount && hidden.length >= 1}
	<p class="foot">{hidden.length} hidden · <button type="button" onclick={() => (hiddenOpen = true)}>show</button></p>
	{#if hiddenOpen}
		<ul>
			{#each hidden as item (item.id)}
				<li>
					<span>{item.title}</span>
					<button type="button" onclick={() => onUnhide(item.id)}>Unhide</button>
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0 0 0.4rem;
	}

	.chips button,
	.actions button,
	.foot button,
	li button {
		font: inherit;
		color: inherit;
		background: transparent;
		cursor: pointer;
	}

	.chips button {
		border: 1px solid #3c414b;
		border-radius: 999px;
		padding: 0.15rem 0.65rem;
		font-size: 0.8rem;
		color: #d9d4c8;
	}

	.chips button[aria-pressed='true'] {
		background: #e6e2d8;
		border-color: #e6e2d8;
		color: #14161a;
	}

	article {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		column-gap: 1rem;
		padding: 0.85rem 0;
		border-top: 1px solid #2c3038;
	}

	.kicker,
	.title,
	.meta,
	.part,
	.now,
	.actions {
		margin: 0;
	}

	.kicker {
		grid-column: 1;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #9c978c;
	}

	.count {
		color: #e6e2d8;
	}

	.title {
		grid-column: 1;
		font-size: 1.05rem;
	}

	.part,
	.now,
	.meta {
		grid-column: 1;
		color: #b7b2a6;
	}

	.now {
		color: #e6e2d8;
	}

	.actions {
		grid-column: 2;
		grid-row: 1 / span 5;
		align-self: start;
		color: #d9d4c8;
		font-size: 0.85rem;
	}

	.actions button,
	.foot button,
	li button {
		border: 0;
		padding: 0;
	}

	.quiet {
		margin: 1.1rem 0 0;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9c978c;
	}

	.foot {
		color: #9c978c;
	}

	ul {
		margin: 0.4rem 0 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.45rem 0;
		border-top: 1px solid #2c3038;
	}
</style>
