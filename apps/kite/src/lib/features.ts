/**
 * Informed News feature gates for leftover Kagi *service* UX (NEWS-47).
 * We do not operate Kagi Maps / Translate / Search account sync backends.
 * Keep false unless a first-party replacement exists.
 */
export const FEATURES = {
	/** Settings → Account tab + syncManager (Kagi Search login / Kagi servers) */
	kagiAccountSync: false,
	/** Settings → Language reading-level paywall + Kagi Translate simplify */
	kagiReadingLevel: false,
	/** Maps provider option that opens kagi.com/maps */
	kagiMaps: false,
	/** Header “Kagi Apps” launcher */
	kagiAppNavigation: false,
	/** Story “Ask Assistant” → kagi.com/assistant */
	kagiAssistant: false,
	/** Settings → About mobile badges for Kagi News store listings */
	kagiMobileApps: false,
} as const;
