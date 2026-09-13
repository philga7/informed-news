/**
 * Informed News product branding for the vendored Kite shell (NEWS-45).
 * MIT attribution for kite-public stays in NOTICE / THIRD_PARTY.md / apps/kite/LICENSE.
 */

export const PRODUCT_NAME = 'Informed News';
export const PRODUCT_MOTTO = 'Signal over noise.';
export const PRODUCT_TITLE_SUFFIX = PRODUCT_NAME;

type LocaleEntry = { text: string; translationContext?: string };
type LocaleMap = Record<string, LocaleEntry>;

/** English product-chrome overrides applied on top of every bundled locale. */
export const BRAND_STRING_OVERRIDES: LocaleMap = {
	'app.title': {
		text: PRODUCT_NAME,
		translationContext: 'Product name shown in splash, intro, and chrome',
	},
	'app.motto': {
		text: PRODUCT_MOTTO,
		translationContext: 'Product motto under the splash title',
	},
	'app.logo.alt': {
		text: `${PRODUCT_NAME} logo`,
		translationContext: 'Alt text for product logo',
	},
	'app.logo.iconAlt': {
		text: `${PRODUCT_NAME} icon`,
		translationContext: 'Alt text for product icon',
	},
	'app.logo.newsAlt': {
		text: `${PRODUCT_NAME} logo`,
		translationContext: 'Alt text for header logo',
	},
	'about.subtitle': {
		text: 'Daily brief with cited sources',
		translationContext: 'About / intro subtitle',
	},
	'about.why.title': {
		text: `Why ${PRODUCT_NAME}? Because news is broken.`,
		translationContext: 'About section title',
	},
	'about.approach.description3': {
		text: `${PRODUCT_NAME} reads public RSS feeds from curated world-wide news sources and uses AI to distill them into one daily briefing. In about five minutes you get every critical perspective and the temporal context. No endless scroll. No attention hijacking.`,
		translationContext: 'About approach description mentioning product name',
	},
	'about.contact.description': {
		text: 'For product feedback on Informed News, use your project channel. Upstream Kite shell issues can still be filed against the open-source kite-public repository.',
		translationContext: 'About contact blurb without Kagi support as product support',
	},
	'about.customization.description': {
		text: `Personalize your feed by reordering and toggling categories in settings. The Brief UI is based on the MIT kite-public shell; Informed News product changes live in this repository.`,
		translationContext: 'About customization without claiming to be Kagi News',
	},
	'footer.about': {
		text: `About ${PRODUCT_NAME}`,
		translationContext: 'Footer about link',
	},
	'footer.contribute': {
		text: 'Contribute',
		translationContext: 'Footer contribute link label',
	},
	'settings.about.aboutKite': {
		text: `About ${PRODUCT_NAME}`,
		translationContext: 'Settings about section title',
	},
	'settings.about.apiDescription': {
		text: `Access ${PRODUCT_NAME} programmatically with our REST API`,
		translationContext: 'Settings API description',
	},
	'settings.about.description': {
		text: `${PRODUCT_NAME} distills curated news sources into one daily briefing with citations. Framing analysis is AI-assisted, not ground truth.`,
		translationContext: 'Settings about short description',
	},
	'settings.about.mobileDescription': {
		text: `Get ${PRODUCT_NAME} on your mobile device`,
		translationContext: 'Settings mobile description',
	},
	'settings.aboutKite.button': {
		text: `About ${PRODUCT_NAME}`,
		translationContext: 'Settings about button',
	},
	'settings.categories.contribute.intro': {
		text: `Help expand ${PRODUCT_NAME} coverage by suggesting new categories. Community contributions keep the brief diverse and comprehensive.`,
		translationContext: 'Contribute categories intro',
	},
	'settings.categories.coreTooltip': {
		text: 'Core curated category. High quality, diverse perspectives.',
		translationContext: 'Tooltip without Kagi team claim',
	},
	'settings.shareLanguage.message': {
		text: `Check out ${PRODUCT_NAME} in {{language}} — it will skip the intro and load directly in your language!`,
		translationContext: 'Share language message',
	},
	'onboarding.welcome.title': {
		text: `Welcome to ${PRODUCT_NAME}!`,
		translationContext: 'Onboarding welcome title',
	},
	'onboarding.categories.subtitle': {
		text: `${PRODUCT_NAME} follows news from around the world, covering national, regional, and local events. Select the categories you're interested in:`,
		translationContext: 'Onboarding categories subtitle',
	},
	'meta.description': {
		text: `${PRODUCT_NAME} distills curated world-wide news sources into one daily briefing. Get critical perspectives in minutes — without endless scroll.`,
		translationContext: 'Default meta description',
	},
	'meta.categoryDescription': {
		text: `Latest {category} news on ${PRODUCT_NAME}`,
		translationContext: 'Category meta description',
	},
	'contribute.pageTitle': {
		text: `Contribute Feeds - ${PRODUCT_NAME}`,
		translationContext: 'Contribute page title',
	},
	'contribute.onboarding.title': {
		text: `Contribute to ${PRODUCT_NAME}`,
		translationContext: 'Contribute onboarding title',
	},
};

export function applyBrandOverrides<T extends LocaleMap>(strings: T | undefined | null): T {
	if (!strings) return { ...BRAND_STRING_OVERRIDES } as T;
	const next = { ...strings };
	for (const [key, entry] of Object.entries(BRAND_STRING_OVERRIDES)) {
		next[key] = { ...entry };
	}
	return next;
}
