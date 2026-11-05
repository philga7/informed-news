<script lang="ts">
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<title>Informed News</title>
</svelte:head>

<main>
	{@render children()}
</main>
