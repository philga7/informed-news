import type { MetaTagsProps } from "svelte-meta-tags";
import locales from "$lib/locales";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async () => {
  // Load default English locale
  return {
    locale: "en",
    strings: locales.en,
    // No Kagi account session on Informed News (NEWS-47).
    session: null as Session | null,
    baseMetaTags: {} as MetaTagsProps,
  };
};
