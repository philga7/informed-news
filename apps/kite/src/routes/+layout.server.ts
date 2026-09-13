import locales from "$lib/locales";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async () => {
  // Load default English locale
  return {
    locale: "en",
    strings: locales.en,
  };
};
