<script lang="ts">
	import { PRODUCT_NAME } from '$lib/brand';
	import FeedbackList from '$lib/components/feedback/FeedbackList.svelte';

	const linkClass =
		'text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300';
</script>

<svelte:head>
	<title>Feedback — {PRODUCT_NAME}</title>
	<meta
		name="description"
		content="Like and Not relevant notes you saved. They steer later scoring and do not mute a story."
	/>
</svelte:head>

<div
	class="min-h-screen bg-app-bg text-gray-900 dark:text-gray-100"
	style="font-family: var(--font-lufga), system-ui, sans-serif;"
>
	<main class="mx-auto max-w-3xl px-4 py-12 sm:py-16">
		<p class="text-sm font-medium tracking-wide text-gray-500 dark:text-gray-400">{PRODUCT_NAME}</p>
		<h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Feedback</h1>
		<p class="mt-3 text-base text-gray-600 dark:text-gray-300">
			Like and Not relevant are soft signals. They steer later scoring. They do not mute a story.
		</p>
		<FeedbackList />
		<p class="mt-12">
			<a href="/" class={linkClass}>← Back to Brief</a>
		</p>
	</main>
</div>
