<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { shellOwnsPath } from '$lib/brief/shellPaths';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	beforeNavigate(({ from, to, cancel }) => {
		if (!to) {
			return;
		}
		if (from && from.url.pathname === to.url.pathname) {
			return;
		}
		if (shellOwnsPath(to.url.pathname)) {
			return;
		}
		cancel();
		location.assign(to.url.href);
	});
</script>

<svelte:head>
	<title>Informed News</title>
</svelte:head>

<main>
	{@render children()}
</main>
