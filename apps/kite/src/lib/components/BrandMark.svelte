<script lang="ts">
import { PRODUCT_NAME } from '$lib/brand';
import { s } from '$lib/client/localization.svelte';

interface Props {
	compact?: boolean;
	class?: string;
}

let { compact = false, class: className = '' }: Props = $props();

const label = $derived(s('app.title') || PRODUCT_NAME);
</script>

<span
  class="brand-mark inline-flex items-center font-semibold tracking-tight text-gray-900 dark:text-dark-text {className}"
  class:text-base={compact}
  class:text-lg={!compact}
  class:sm:text-xl={!compact}
  data-brand="informed-news"
>
  <span
    class="me-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-900 text-[10px] font-bold text-white dark:bg-white dark:text-gray-900"
    aria-hidden="true"
  >IN</span>
  <span class="leading-none">{label}</span>
</span>
