<script lang="ts">
	import { REFRESH_LABEL, REFRESHING_LABEL } from '$lib/brief/briefClient';

	/**
	 * Pipeline status line and Refresh control. The parent owns the POST.
	 * Times are the viewer's local clock; the ISO stays on the time element.
	 */

	interface Props {
		running: boolean;
		runningSince: string | null;
		lastFetchAt: string | null;
		lastFetchOk: boolean | null;
		keysOn: boolean;
		onRefresh: () => void;
	}

	let { running, runningSince, lastFetchAt, lastFetchOk, keysOn, onRefresh }: Props = $props();

	function clock(iso: string): string {
		return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	}

	function clockTitle(iso: string): string {
		return new Date(iso).toLocaleString();
	}

	function refresh(): void {
		if (running || !keysOn) return;
		onRefresh();
	}
</script>

{#if running && runningSince}
	<p>
		<span>Refreshing since</span>
		<time datetime={runningSince} title={clockTitle(runningSince)}>{clock(runningSince)}</time>
	</p>
{:else if running}
	<p>{REFRESHING_LABEL}</p>
{:else if lastFetchAt && lastFetchOk === true}
	<p>
		<span>Last fetch succeeded</span>
		<time datetime={lastFetchAt} title={clockTitle(lastFetchAt)}>{clock(lastFetchAt)}</time>
	</p>
{:else if lastFetchAt && lastFetchOk === false}
	<p>
		<span>Last fetch failed</span>
		<time datetime={lastFetchAt} title={clockTitle(lastFetchAt)}>{clock(lastFetchAt)}</time>
	</p>
{:else}
	<p>No fetch yet</p>
{/if}
<button type="button" disabled={running || !keysOn} aria-busy={running} onclick={refresh}>
	{running ? REFRESHING_LABEL : REFRESH_LABEL}
</button>
