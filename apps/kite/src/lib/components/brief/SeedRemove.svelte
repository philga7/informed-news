<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { BRIEF_SEED_LOGIN_HREF } from '$lib/briefSeed';
	import {
		BRIEF_REMOVE_LABEL,
		BRIEF_REMOVE_PENDING,
		postRemoveSeed,
	} from '$lib/topicBrief';

	interface Props {
		articleId: string;
		onRemoved: () => void;
	}

	let { articleId, onRemoved }: Props = $props();

	type Failure = { message: string; login: boolean };

	let pending = $state(false);
	let failure = $state<Failure | null>(null);

	/** Page shortcuts (Enter / j / k / ? …) listen on window; keep them out of this control. */
	const isolateShortcuts: Attachment<HTMLElement> = (node) => {
		const stop = (event: KeyboardEvent) => event.stopPropagation();
		node.addEventListener('keydown', stop);
		return () => node.removeEventListener('keydown', stop);
	};

	async function remove(): Promise<void> {
		if (pending) return;
		pending = true;
		failure = null;
		const result = await postRemoveSeed(articleId);
		pending = false;
		if (!result.ok) {
			failure = { message: result.error, login: result.unauthenticated };
			return;
		}
		onRemoved();
	}
</script>

<div class="pt-1 text-xs" {@attach isolateShortcuts}>
	<button
		type="button"
		class="font-medium text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline disabled:opacity-60 dark:text-gray-400 dark:hover:text-gray-100"
		data-testid="seed-remove"
		disabled={pending}
		aria-busy={pending}
		onclick={remove}
	>
		{pending ? BRIEF_REMOVE_PENDING : BRIEF_REMOVE_LABEL}
	</button>

	{#if failure?.login}
		<p class="mt-1" role="alert">
			<a
				href={BRIEF_SEED_LOGIN_HREF}
				class="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
			>
				{failure.message}
			</a>
		</p>
	{:else if failure}
		<p class="mt-1 text-red-700 dark:text-red-400" role="alert">{failure.message}</p>
	{/if}
</div>
