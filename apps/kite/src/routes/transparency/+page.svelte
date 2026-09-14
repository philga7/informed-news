<script lang="ts">
import { PRODUCT_NAME, PRODUCT_MOTTO } from '$lib/brand';
import {
	TRANSPARENCY_INTRO,
	TRANSPARENCY_PAGE_TITLE,
	TRANSPARENCY_SECTIONS,
} from '$lib/transparency';
</script>

<svelte:head>
	<title>{TRANSPARENCY_PAGE_TITLE}</title>
	<meta
		name="description"
		content="Funding, methodology, corrections, and team disclosures for {PRODUCT_NAME}."
	/>
</svelte:head>

<div class="min-h-screen bg-app-bg text-gray-900 dark:text-gray-100" style="font-family: var(--font-lufga), system-ui, sans-serif;">
	<main class="mx-auto max-w-2xl px-4 py-12 sm:py-16">
		<p class="text-sm font-medium tracking-wide text-gray-500 dark:text-gray-400">
			{PRODUCT_NAME}
		</p>
		<h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Transparency</h1>
		<p class="mt-3 text-base text-gray-600 dark:text-gray-300">
			{PRODUCT_MOTTO}
		</p>
		<p class="mt-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
			{TRANSPARENCY_INTRO}
		</p>

		<nav class="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="On this page">
			{#each TRANSPARENCY_SECTIONS as section}
				<a
					href="#{section.id}"
					class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
				>
					{section.title}
				</a>
			{/each}
		</nav>

		{#each TRANSPARENCY_SECTIONS as section}
			<section id={section.id} class="mt-12 scroll-mt-8">
				<h2 class="text-xl font-semibold tracking-tight">{section.title}</h2>
				<div class="mt-4 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
					{#each section.paragraphs as paragraph}
						<p>{paragraph}</p>
					{/each}
				</div>
			</section>
		{/each}

		<p class="mt-14 border-t border-gray-200 pt-8 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
			Last updated for NEWS-32. AI classifications on this product are not definitive.
		</p>

		<p class="mt-8">
			<a
				href="/"
				class="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
			>
				← Back to Brief
			</a>
		</p>
	</main>
</div>
