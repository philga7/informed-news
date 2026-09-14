<script lang="ts">
import { s } from '$lib/client/localization.svelte';
import DataLanguageSelector from './snippets/DataLanguageSelector.svelte';
import LanguageSelector from './snippets/LanguageSelector.svelte';
import { FEATURES } from '$lib/features';
</script>

<div class="space-y-8">
  <!-- Language Settings Section -->
  <div class="space-y-4">
    <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
      {s("settings.subsections.localization") || "Language & Region"}
    </h3>
    <div class="space-y-4 ps-2">
      <LanguageSelector showTooltip={true} showLoadingSpinner={true} />

      <!-- Kagi Translate “powered by” link gated off (NEWS-47) -->
      <DataLanguageSelector
        showTooltip={true}
        showLoadingSpinner={true}
        showTranslateLink={FEATURES.kagiReadingLevel}
      />
    </div>
  </div>
</div>
