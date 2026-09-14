<script lang="ts">
import { PRODUCT_NAME, PRODUCT_MOTTO } from '$lib/brand';
</script>

<svelte:head>
	<title>Transparency — {PRODUCT_NAME}</title>
	<meta
		name="description"
		content="Funding, methodology, and honesty commitments for {PRODUCT_NAME}."
	/>
</svelte:head>

<div class="min-h-screen bg-app-bg text-gray-900 dark:text-gray-100">
	<main class="mx-auto max-w-2xl px-4 py-12 sm:py-16">
		<p class="text-sm font-medium tracking-wide text-gray-500 dark:text-gray-400">
			{PRODUCT_NAME}
		</p>
		<h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Transparency</h1>
		<p class="mt-3 text-base text-gray-600 dark:text-gray-300">
			{PRODUCT_MOTTO} This page is public — no login required.
		</p>

		<section class="mt-10 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
			<p>
				Framing and enrichment shown in the Brief are
				<strong>AI-assisted analysis, not ground truth</strong>. We do not publish left–right
				bias scores, outlet trust grids, or claim verdicts.
			</p>
			<p>
				Full funding disclosure, methodology detail, corrections policy, and (where applicable)
				bios will land in
				<a
					class="text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400"
					href="https://informedcrew.atlassian.net/browse/NEWS-32"
					target="_blank"
					rel="noopener noreferrer">NEWS-32</a
				>. This route exists so the product nav shell can link here without empty Finance /
				Situation / Listen tabs.
			</p>
		</section>

		<p class="mt-12">
			<a
				href="/"
				class="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
			>
				← Back to Brief
			</a>
		</p>
	</main>
</div>
