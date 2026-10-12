import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	E2E_API_PORT,
	E2E_DATA_DIR,
	E2E_KITE_PORT,
	E2E_MVP_PASSWORD,
	E2E_SEED_ARTICLE_PATH,
	e2eFixtureUrl,
} from './stack/config.mjs';
import { TOPIC_SCENARIO, writeScenario } from './stack/scenarios.mjs';

type BriefOverview = {
	ok: boolean;
	fixture: boolean;
	notices: string[];
	sections: Array<{ topicId: string; name: string; storyIds: string[]; moreIds: string[] }>;
	quiet: Array<{ id: string; name: string }>;
};

type KiteStory = {
	id?: string;
	title?: string;
	category?: string;
	cluster_number?: number;
	primary_image?: { url?: string; caption?: string };
	articles?: Array<{ image?: string }>;
	domains?: Array<{ name: string }>;
	perspectives?: unknown[];
	talking_points?: unknown[];
	timeline?: unknown[];
	suggested_qna?: unknown[];
	informed_article_id?: string;
	informed_topic_name?: string;
	informed_summary_status?: string;
	informed_full_story_status?: string;
};

function useScenario(name: 'topics' | 'empty'): void {
	writeScenario(E2E_DATA_DIR, name, { imageBaseUrl: `http://localhost:${E2E_KITE_PORT}` });
}

/** Kite proxy → owned batch → first category → its stories. */
async function loadOwnedStories(page: Page): Promise<KiteStory[]> {
	const latest = await page.request.get('/api/batches/latest');
	expect(latest.ok()).toBeTruthy();
	const batch = (await latest.json()) as { id?: string };
	expect(batch.id).toBe('owned-latest');

	const categories = await page.request.get(`/api/batches/${batch.id}/categories`);
	expect(categories.ok()).toBeTruthy();
	const catBody = (await categories.json()) as {
		categories?: Array<{ id: string; categoryId?: string; categoryName?: string }>;
	};
	expect(catBody.categories?.[0]?.categoryId).toBe('world');
	expect(catBody.categories?.[0]?.categoryName).toBe('Brief');
	const categoryUuid = catBody.categories?.[0]?.id;
	expect(categoryUuid, 'expected first owned category id').toBeTruthy();

	const storiesRes = await page.request.get(
		`/api/batches/${batch.id}/categories/${categoryUuid}/stories?limit=12`,
	);
	expect(storiesRes.ok()).toBeTruthy();
	const body = (await storiesRes.json()) as { stories?: KiteStory[] };
	expect(Array.isArray(body.stories)).toBeTruthy();
	return body.stories ?? [];
}

/** Session for session pages: the page's request context shares its cookie jar with the page. */
async function logIn(page: Page): Promise<void> {
	const login = await page.request.post('/api/login', { data: { password: E2E_MVP_PASSWORD } });
	expect(login.ok()).toBeTruthy();
}

type TopicRow = { id: string; name: string; kind: 'desired' | 'undesired' };

async function listTopics(page: Page): Promise<TopicRow[]> {
	const list = await page.request.get('/api/topics');
	expect(list.ok()).toBeTruthy();
	return ((await list.json()) as { topics: TopicRow[] }).topics;
}

async function removeUndesiredTopics(page: Page, name: string): Promise<void> {
	for (const topic of (await listTopics(page)).filter(
		(t) => t.kind === 'undesired' && t.name === name,
	)) {
		const removed = await page.request.delete(`/api/topics/${topic.id}`);
		expect(removed.ok()).toBeTruthy();
	}
}

async function briefCard(page: Page, title: string): Promise<Locator> {
	await page.goto('/');
	await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });
	const story = (await loadOwnedStories(page)).find((s) => s.title === title);
	expect(story?.cluster_number, `expected "${title}" to have a card`).toBeTruthy();
	const card = page.locator(`article#story-${story?.cluster_number}`);
	await expect(card).toBeVisible({ timeout: 60_000 });
	return card;
}

/** The story title button toggles expand / collapse; its accessible name is the title. */
function storyToggle(card: Locator, title: string): Locator {
	return card.getByRole('button', { name: title, exact: true });
}

/** Keep focus off a just-clicked control: Enter on a focused button or link activates it, not the page selection. */
async function blurFocus(page: Page): Promise<void> {
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** Add story (signed in): a manual seed pinned first in `topicName`, backed by the e2e fixture page. */
async function addSeed(page: Page, title: string, topicName: string): Promise<void> {
	await page.getByRole('button', { name: 'Add story', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Add story to Brief' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
	await dialog.getByRole('combobox', { name: 'Topic', exact: true }).selectOption({ label: topicName });
	await dialog
		.getByRole('textbox', { name: 'URLs (one per line, at least one)', exact: true })
		.fill(e2eFixtureUrl(E2E_SEED_ARTICLE_PATH));
	await dialog.getByRole('button', { name: 'Add to Brief', exact: true }).click();
	await expect(dialog).toHaveCount(0, { timeout: 30_000 });
}

function sharedBanner(page: Page): Locator {
	return page.getByText(/Viewing a shared story/);
}

function storyContent(page: Page, story: KiteStory): Locator {
	return page
		.locator(`article#story-${story.cluster_number}`)
		.getByRole('region', { name: 'Story content', exact: true });
}

function watchKagiRequests(page: Page): string[] {
	const kagiHosts: string[] = [];
	page.on('request', (req) => {
		if (req.url().includes('kite.kagi.com')) kagiHosts.push(req.url());
	});
	return kagiHosts;
}

test.describe('Informed News shell branding (NEWS-45)', () => {
	test('Brief chrome uses Informed News title, not Kagi News', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });
		await expect(page.getByText('Informed News').first()).toBeVisible({ timeout: 60_000 });
		await expect(page.locator('body')).not.toContainText('Kagi News BETA');
		await expect(page.locator('body')).toBeVisible();
	});
});

test.describe('Topic Brief (NEWS-88)', () => {
	test.beforeEach(() => useScenario('topics'));

	test('topic Brief stories expose primary_image (NEWS-52)', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });

		const stories = await loadOwnedStories(page);
		expect(stories.length).toBe(5);
		for (const story of stories) {
			expect(story.primary_image?.url, `${story.title} primary_image.url`).toBeTruthy();
			expect(story.primary_image?.caption?.trim().length ?? 0).toBeGreaterThan(0);
		}
	});

	test('sections, More, quiet topics, summaries and refresh bar render without kite.kagi.com', async ({
		page,
	}) => {
		const kagiHosts = watchKagiRequests(page);
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });

		const stories = await loadOwnedStories(page);
		const overviewRes = await page.request.get('/api/brief/overview');
		expect(overviewRes.ok()).toBeTruthy();
		const overview = (await overviewRes.json()) as BriefOverview;
		expect(overview.ok).toBe(true);
		expect(overview.fixture).toBe(false);
		expect(overview.sections.map((s) => s.name)).toEqual(
			TOPIC_SCENARIO.sections.map((s) => s.name),
		);
		expect(overview.sections[0]!.storyIds).toHaveLength(3);
		expect(overview.sections[0]!.moreIds).toHaveLength(TOPIC_SCENARIO.gridMoreCount);
		expect(overview.quiet.map((q) => q.name)).toEqual(TOPIC_SCENARIO.quiet.map((q) => q.name));

		const storyIds = new Set(stories.map((s) => s.id));
		for (const section of overview.sections) {
			for (const id of [...section.storyIds, ...section.moreIds]) {
				expect(storyIds.has(id), `overview story ${id} missing from stories`).toBeTruthy();
			}
		}
		for (const story of stories) {
			expect(story.informed_article_id).toBe(story.id);
			// NEWS-97: card category label is the topic name; never upstream "WORLD".
			expect(story.category?.toUpperCase()).not.toBe(TOPIC_SCENARIO.forbiddenCardCategoryLabel);
			expect(story.category).toBe(story.informed_topic_name);
			expect(TOPIC_SCENARIO.sections.map((s) => s.name)).toContain(story.category);
		}
		expect(stories.map((s) => s.informed_summary_status).sort()).toEqual([
			'missing',
			'missing',
			'missing',
			'ok',
			'unavailable',
		]);

		const bar = page.getByTestId('brief-refresh-bar');
		await expect(bar).toBeVisible({ timeout: 60_000 });
		await expect(bar.getByRole('button', { name: /^Refresh/ })).toBeVisible();

		const sections = page.getByTestId('topic-brief-section');
		await expect(sections).toHaveCount(2);
		const grid = sections.first();
		await expect(
			grid.getByRole('heading', { name: TOPIC_SCENARIO.sections[0]!.name, exact: true }),
		).toBeVisible();
		await expect(grid.getByText(TOPIC_SCENARIO.summaryText)).toBeVisible();
		await expect(grid.getByText('AI summary — not ground truth')).toBeVisible();

		const more = grid.getByRole('button', { name: `More (${TOPIC_SCENARIO.gridMoreCount})` });
		await expect(more).toHaveAttribute('aria-expanded', 'false');
		await expect(grid.getByText('Regulator opens review of overnight tariffs')).toHaveCount(0);
		await more.click();
		await expect(grid.getByText('Regulator opens review of overnight tariffs')).toBeVisible();

		// NEWS-97: card labels show topic names; "WORLD" must not appear on cards.
		const gridCardLabels = grid.locator('article[id^="story-"] .category-label');
		await expect(gridCardLabels.first()).toHaveText(TOPIC_SCENARIO.sections[0]!.name, {
			ignoreCase: true,
		});
		expect(await gridCardLabels.count()).toBeGreaterThan(0);
		for (const label of await gridCardLabels.all()) {
			await expect(label).not.toHaveText(TOPIC_SCENARIO.forbiddenCardCategoryLabel);
			await expect(label).toHaveText(TOPIC_SCENARIO.sections[0]!.name, { ignoreCase: true });
		}

		await expect(sections.nth(1).getByText(TOPIC_SCENARIO.duplicateOutletBadge)).toBeVisible();
		await expect(page.getByTestId('topic-brief-quiet')).toContainText(
			`Nothing new: ${TOPIC_SCENARIO.quiet[0]!.name}`,
		);

		expect(kagiHosts, `unexpected kite.kagi.com requests: ${kagiHosts.join(', ')}`).toEqual([]);
	});

	test('a cached full story expands with rich content and its AI disclaimer', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });

		const stories = await loadOwnedStories(page);
		const fullStory = stories.find((story) => story.title === 'Operators add battery storage before winter peak');
		expect(fullStory?.informed_full_story_status).toBe('ok');
		expect(fullStory?.talking_points).toContain(TOPIC_SCENARIO.fullStoryTalkingPoint);
		expect(fullStory?.cluster_number, 'expected cached full story to have a card').toBeTruthy();

		const storyCard = page.locator(`article#story-${fullStory?.cluster_number}`);
		await expect(storyCard).toBeVisible({ timeout: 60_000 });
		await storyToggle(storyCard, fullStory!.title!).click();
		await expect(storyCard.getByText(TOPIC_SCENARIO.fullStoryTalkingPoint)).toBeVisible();
		await expect(storyCard.getByText('AI-assisted — not ground truth.')).toBeVisible();
	});

	test('the story title button is named by the title and reports whether the card is open', async ({
		page,
	}) => {
		const { title } = TOPIC_SCENARIO.lessLikeThis;
		const card = await briefCard(page, title);
		const toggle = storyToggle(card, title);
		const content = card.getByRole('region', { name: 'Story content' });

		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await toggle.click();
		await expect(content).toBeVisible();
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');

		await toggle.click();
		await expect(content).toHaveCount(0);
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	});
});

test.describe('Filtered out + Less like this (NEWS-90)', () => {
	test.beforeEach(() => useScenario('topics'));

	test('refresh bar links to /filtered, which lists every dropped story under its reason', async ({
		page,
	}) => {
		await logIn(page);
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });

		const link = page.getByTestId('brief-filtered-link');
		await expect(link).toHaveText(`${TOPIC_SCENARIO.filtered.length} filtered out`, {
			timeout: 60_000,
		});
		await link.click();
		await expect(page).toHaveURL(/\/filtered\/?$/);
		await expect(page).toHaveTitle(/Filtered out/i);
		await expect(page.getByRole('heading', { name: 'Filtered out', exact: true })).toBeVisible();
		await expect(
			page.getByText('Reasons from story scoring are AI-assisted judgments, not ground truth.'),
		).toBeVisible();

		const groups = page.getByTestId('filtered-group');
		await expect(groups.getByRole('heading')).toHaveText(
			TOPIC_SCENARIO.filtered.map((f) => `${f.label} (1)`),
		);
		const group = (label: string) =>
			groups.filter({ has: page.getByRole('heading', { name: `${label} (1)`, exact: true }) });
		for (const { title, label } of TOPIC_SCENARIO.filtered) {
			await expect(group(label).getByTestId('filtered-item')).toContainText(title);
		}
		await expect(
			group('Muted').getByText(`Muted by: ${TOPIC_SCENARIO.undesiredTopic.name}`, { exact: true }),
		).toBeVisible();
		await expect(group('Duplicate').getByText(/^Duplicate of:/)).toContainText(
			'Port workers reach tentative agreement',
		);
		await expect(group('Not scored (budget)').getByText('Retried next refresh')).toBeVisible();
		await expect(page.getByText(TOPIC_SCENARIO.filteredEarlier.title)).toHaveCount(0);

		await page.getByRole('button', { name: 'Last 48 hours' }).click();
		await expect(page.getByRole('button', { name: 'Last 48 hours' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		await expect(groups).toHaveCount(TOPIC_SCENARIO.filtered.length + 1);
		await expect(
			group(TOPIC_SCENARIO.filteredEarlier.label).getByTestId('filtered-item'),
		).toContainText(TOPIC_SCENARIO.filteredEarlier.title);
	});

	test('Less like this blocks the outlet and Topics lists it under Undesired', async ({ page }) => {
		const { title, domain } = TOPIC_SCENARIO.lessLikeThis;
		await logIn(page);
		const card = await briefCard(page, title);
		const trigger = card.getByRole('button', { name: 'Less like this', exact: true });
		await expect(trigger).toHaveCount(0);

		try {
			await storyToggle(card, title).click();
			await trigger.click();
			await expect(card.getByLabel('Undesired topic name')).toHaveValue(title);
			await card.getByRole('button', { name: `Block ${domain}`, exact: true }).click();
			await expect(card.getByTestId('less-like-this-success')).toContainText(
				`Added "${domain}" to undesired topics. Matching stories are hidden the next time the Brief loads, and filtered out from the next refresh.`,
			);
			// Wait for the success line (and its View Topics link) before leaving the Brief so
			// in-flight proxy work is not aborted mid-navigation (NEWS-105).
			await expect(card.getByRole('link', { name: 'View Topics', exact: true })).toBeVisible();
			await page.waitForLoadState('networkidle');

			await page.goto('/topics');
			const undesired = page.locator('section[aria-labelledby="topics-undesired"]');
			await expect(undesired.getByRole('heading', { name: domain, exact: true })).toBeVisible({
				timeout: 60_000,
			});
			await expect(
				undesired.getByRole('heading', { name: TOPIC_SCENARIO.undesiredTopic.name, exact: true }),
			).toBeVisible();
		} finally {
			await removeUndesiredTopics(page, domain);
		}

		const after = (await loadOwnedStories(page)).map((s) => s.title);
		expect(after).toContain(title);
	});

	test('Less like this Not interested in this subject creates an undesired topic on Topics', async ({
		page,
	}) => {
		const { title } = TOPIC_SCENARIO.lessLikeThisSubject;
		let createdName: string | null = null;
		await logIn(page);
		const card = await briefCard(page, title);

		try {
			await storyToggle(card, title).click();
			await card.getByRole('button', { name: 'Less like this', exact: true }).click();
			await expect(card.getByText('Not interested in this subject')).toBeVisible();
			const nameInput = card.getByLabel('Undesired topic name');
			await expect(nameInput).toHaveValue(title);
			createdName = title;
			await card.getByRole('button', { name: 'Add undesired topic', exact: true }).click();
			await expect(card.getByTestId('less-like-this-success')).toContainText(
				`Added "${title}" to undesired topics. Matching stories are hidden the next time the Brief loads, and filtered out from the next refresh.`,
			);
			await expect(card.getByRole('link', { name: 'View Topics', exact: true })).toBeVisible();
			await page.waitForLoadState('networkidle');

			await page.goto('/topics');
			const undesired = page.locator('section[aria-labelledby="topics-undesired"]');
			await expect(undesired.getByRole('heading', { name: title, exact: true })).toBeVisible({
				timeout: 60_000,
			});
		} finally {
			if (createdName) await removeUndesiredTopics(page, createdName);
		}
	});
});

test.describe('Less like this keyboard, focus and name taken (NEWS-125)', () => {
	test.beforeEach(() => useScenario('topics'));

	test('Escape in the open panel cancels it and keeps the page selection; with the panel closed, Escape reaches the page', async ({
		page,
	}) => {
		const { title } = TOPIC_SCENARIO.lessLikeThis;
		await logIn(page);
		const card = await briefCard(page, title);
		const trigger = card.getByRole('button', { name: 'Less like this', exact: true });

		await expect(card).not.toHaveAttribute('aria-current');
		await page.keyboard.press('j');
		await expect(card).toHaveAttribute('aria-current', 'true');
		await storyToggle(card, title).click();
		await trigger.click();
		const nameInput = card.getByLabel('Undesired topic name');
		await expect(nameInput).toBeFocused();

		await page.keyboard.press('Escape');
		await expect(nameInput).toHaveCount(0);
		await expect(trigger).toBeFocused();
		await expect(card).toHaveAttribute('aria-current', 'true');

		await page.keyboard.press('Escape');
		await expect(card).not.toHaveAttribute('aria-current');
		await expect(trigger).toBeVisible();
	});

	test('after a save, focus is on View Topics and the saved line survives collapse and re-expand', async ({
		page,
	}) => {
		const { title } = TOPIC_SCENARIO.lessLikeThisSubject;
		const savedLine = `Added "${title}" to undesired topics.`;
		await logIn(page);
		const card = await briefCard(page, title);
		const toggle = storyToggle(card, title);
		const content = card.getByRole('region', { name: 'Story content' });
		const saved = card.getByTestId('less-like-this-success');

		try {
			await toggle.click();
			await card.getByRole('button', { name: 'Less like this', exact: true }).click();
			await card.getByRole('button', { name: 'Add undesired topic', exact: true }).click();
			await expect(saved).toContainText(savedLine);
			await expect(saved.getByRole('link', { name: 'View Topics', exact: true })).toBeFocused();

			await toggle.click();
			await expect(content).toHaveCount(0);
			await expect(saved).toHaveCount(0);

			await toggle.click();
			await expect(content).toBeVisible();
			await expect(saved).toContainText(savedLine);
			await expect(card.getByRole('button', { name: 'Less like this', exact: true })).toHaveCount(0);
		} finally {
			await removeUndesiredTopics(page, title);
		}
	});

	test('a taken name (409) says nothing was saved, links to View Topics, and keeps the panel open', async ({
		page,
	}) => {
		const taken = TOPIC_SCENARIO.sections[0]!.name;
		const { title } = TOPIC_SCENARIO.lessLikeThisSubject;
		await logIn(page);
		const card = await briefCard(page, title);

		await storyToggle(card, title).click();
		await card.getByRole('button', { name: 'Less like this', exact: true }).click();
		const nameInput = card.getByLabel('Undesired topic name');
		await nameInput.fill(taken);
		await card.getByRole('button', { name: 'Add undesired topic', exact: true }).click();

		const alert = card.getByRole('alert');
		await expect(alert).toContainText(
			`A topic named "${taken}" already exists, so nothing was saved.`,
		);
		await expect(alert.getByRole('link', { name: 'View Topics', exact: true })).toHaveAttribute(
			'href',
			'/topics',
		);
		await expect(nameInput).toHaveValue(taken);
		await expect(card.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
		await expect(card.getByTestId('less-like-this-success')).toHaveCount(0);

		const undesired = (await listTopics(page)).filter((t) => t.kind === 'undesired');
		expect(undesired.map((t) => t.name)).toEqual([TOPIC_SCENARIO.undesiredTopic.name]);
	});
});

test.describe('Keyboard story selection is announced (NEWS-129)', () => {
	test.beforeEach(() => useScenario('topics'));

	const selected = (story: KiteStory) => `Selected story: ${story.title}`;

	test('j / k / G / gg announce the selected story politely without moving focus; Enter / o / x act once; Escape clears', async ({
		page,
	}) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });
		const stories = await loadOwnedStories(page);
		const first = stories[0]!;
		const second = stories[1]!;
		const last = stories[stories.length - 1]!;
		const secondCard = page.locator(`article#story-${second.cluster_number}`);
		await expect(secondCard).toBeVisible({ timeout: 60_000 });

		const announcer = page.getByTestId('keyboard-selection-announcer');
		await expect(announcer).toHaveAttribute('aria-live', 'polite');
		await expect(announcer).toHaveText('');

		await page.keyboard.press('j');
		await expect(announcer).toHaveText(selected(first));
		await page.keyboard.press('j');
		await expect(announcer).toHaveText(selected(second));
		await expect(secondCard).toHaveAttribute('aria-current', 'true');
		await expect(page.locator('body')).toBeFocused();

		const toggle = storyToggle(secondCard, second.title!);
		await page.keyboard.press('Enter');
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await page.keyboard.press('Enter');
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await page.keyboard.press('o');
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await page.keyboard.press('o');
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await page.keyboard.press('x');
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');

		await page.keyboard.press('G');
		await expect(announcer).toHaveText(selected(last));
		await page.keyboard.press('g');
		await page.keyboard.press('g');
		await expect(announcer).toHaveText(selected(first));
		await page.keyboard.press('j');
		await expect(announcer).toHaveText(selected(second));
		await page.keyboard.press('k');
		await expect(announcer).toHaveText(selected(first));

		await page.keyboard.press('Escape');
		await expect(announcer).toHaveText('');
		await expect(page.locator('article[aria-current]')).toHaveCount(0);
	});

	test('typing j / k in the Add story form does not change or announce the selection', async ({
		page,
	}) => {
		await logIn(page);
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });
		const first = (await loadOwnedStories(page))[0]!;
		await expect(page.locator(`article#story-${first.cluster_number}`)).toBeVisible({
			timeout: 60_000,
		});
		const announcer = page.getByTestId('keyboard-selection-announcer');

		await page.keyboard.press('j');
		await expect(announcer).toHaveText(selected(first));

		await page.getByRole('button', { name: 'Add story', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Add story to Brief' });
		const title = dialog.getByRole('textbox', { name: 'Title', exact: true });
		await title.pressSequentially('jjk');
		await expect(title).toHaveValue('jjk');
		await expect(announcer).toHaveText(selected(first));
	});
});

test.describe('Keyboard selection follows the visible topic Brief (NEWS-133)', () => {
	test.beforeEach(() => useScenario('topics'));

	test('j / k / G / gg step through on-screen stories only; More adds its stories, Show fewer removes them', async ({
		page,
	}) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });
		const stories = await loadOwnedStories(page);
		const overviewRes = await page.request.get('/api/brief/overview');
		expect(overviewRes.ok()).toBeTruthy();
		const overview = (await overviewRes.json()) as BriefOverview;
		const titleOf = (id: string) => stories.find((s) => s.id === id)!.title!;
		const collapsed = overview.sections.flatMap((s) => s.storyIds).map(titleOf);
		const opened = overview.sections
			.flatMap((s, i) => (i === 0 ? [...s.storyIds, ...s.moreIds] : s.storyIds))
			.map(titleOf);
		const [moreTitle] = overview.sections[0]!.moreIds.map(titleOf);
		expect(moreTitle).toBeTruthy();

		const grid = page.getByTestId('topic-brief-section').first();
		await expect(grid.locator('article[id^="story-"]').first()).toBeVisible({ timeout: 60_000 });
		const announcer = page.getByTestId('keyboard-selection-announcer');
		const selectedCard = page.locator('article[aria-current="true"]');
		const expectSelected = async (title: string) => {
			await expect(announcer).toHaveText(`Selected story: ${title}`);
			await expect(selectedCard).toHaveCount(1);
			await expect(storyToggle(selectedCard, title)).toBeVisible();
		};

		for (const title of collapsed) {
			await page.keyboard.press('j');
			await expectSelected(title);
		}
		await page.keyboard.press('j');
		await expectSelected(collapsed[collapsed.length - 1]!);
		await page.keyboard.press('g');
		await page.keyboard.press('g');
		await expectSelected(collapsed[0]!);
		await page.keyboard.press('G');
		await expectSelected(collapsed[collapsed.length - 1]!);

		await grid.getByRole('button', { name: /^More \(/ }).click();
		await blurFocus(page);
		await page.keyboard.press('g');
		await page.keyboard.press('g');
		await expectSelected(opened[0]!);
		for (const title of opened.slice(1)) {
			await page.keyboard.press('j');
			await expectSelected(title);
		}
		await page.keyboard.press('k');
		await expectSelected(moreTitle!);

		const moreToggle = storyToggle(selectedCard, moreTitle!);
		await page.keyboard.press('Enter');
		await expect(moreToggle).toHaveAttribute('aria-expanded', 'true');
		await page.keyboard.press('x');
		await expect(moreToggle).toHaveAttribute('aria-expanded', 'false');

		await grid.getByRole('button', { name: 'Show fewer', exact: true }).click();
		await expect(grid.getByText(moreTitle!, { exact: true })).toHaveCount(0);
		await expect(selectedCard).toHaveCount(0);
		await expect(announcer).toHaveText('');
	});

	test('before the topic overview loads, j selects nothing; once sections render, j picks the first visible story', async ({
		page,
	}) => {
		let releaseOverview: () => void = () => {};
		const overviewHeld = new Promise<void>((resolve) => {
			releaseOverview = resolve;
		});
		await page.route('**/api/brief/overview', async (route) => {
			await overviewHeld;
			await route.continue();
		});

		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });
		const announcer = page.getByTestId('keyboard-selection-announcer');
		await expect(announcer).toBeAttached({ timeout: 60_000 });
		await expect(page.getByTestId('topic-brief-section')).toHaveCount(0);

		await page.keyboard.press('j');
		await page.keyboard.press('G');
		await expect(announcer).toHaveText('');
		await expect(page.locator('article[aria-current="true"]')).toHaveCount(0);

		releaseOverview();
		const grid = page.getByTestId('topic-brief-section').first();
		const firstCard = grid.locator('article[id^="story-"]').first();
		await expect(firstCard).toBeVisible({ timeout: 60_000 });
		await page.keyboard.press('j');
		await expect(firstCard).toHaveAttribute('aria-current', 'true');
	});
});

test.describe('Enter on a focused control activates that control (NEWS-134)', () => {
	test.beforeEach(() => useScenario('topics'));

	test("with story 1 j-selected, Enter on story 2's focused title expands story 2 only; o / x / j / k stay page shortcuts", async ({
		page,
	}) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });
		const [first, second] = await loadOwnedStories(page);
		const firstCard = page.locator(`article#story-${first!.cluster_number}`);
		const secondCard = page.locator(`article#story-${second!.cluster_number}`);
		await expect(secondCard).toBeVisible({ timeout: 60_000 });
		const firstToggle = storyToggle(firstCard, first!.title!);
		const secondToggle = storyToggle(secondCard, second!.title!);
		const announcer = page.getByTestId('keyboard-selection-announcer');

		await page.keyboard.press('j');
		await expect(announcer).toHaveText(`Selected story: ${first!.title}`);

		await secondToggle.focus();
		await page.keyboard.press('Enter');
		await expect(secondToggle).toHaveAttribute('aria-expanded', 'true');
		await expect(firstToggle).toHaveAttribute('aria-expanded', 'false');
		await expect(firstCard).toHaveAttribute('aria-current', 'true');

		await expect(secondToggle).toBeFocused();
		await page.keyboard.press('o');
		await expect(firstToggle).toHaveAttribute('aria-expanded', 'true');
		await expect(secondToggle).toHaveAttribute('aria-expanded', 'true');
		await page.keyboard.press('x');
		await expect(firstToggle).toHaveAttribute('aria-expanded', 'false');
		await expect(secondToggle).toHaveAttribute('aria-expanded', 'true');
		await page.keyboard.press('j');
		await expect(announcer).toHaveText(`Selected story: ${second!.title}`);
		await page.keyboard.press('k');
		await expect(announcer).toHaveText(`Selected story: ${first!.title}`);
	});
});

test.describe('Shared article view (NEWS-130)', () => {
	test.beforeEach(() => useScenario('topics'));

	test('the shared story title is plain text, not a dead expand toggle', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });
		const shared = (await loadOwnedStories(page))[0]!;

		await page.goto('/latest/world/0?shared=1');
		await expect(sharedBanner(page)).toBeVisible({ timeout: 60_000 });
		const card = page.locator(`article#story-${shared.cluster_number}`);
		await expect(card.getByText(shared.title!, { exact: true })).toBeVisible();
		await expect(storyToggle(card, shared.title!)).toHaveCount(0);
		await expect(card.locator('[aria-expanded]')).toHaveCount(0);
	});
});

test.describe('Shared article view keyboard shortcuts (NEWS-135)', () => {
	test.beforeEach(() => useScenario('topics'));

	test('j / k / G / gg select and announce nothing; Enter / o / x keep the shared story open; View latest stories restores them', async ({
		page,
	}) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });
		const [first, shared] = await loadOwnedStories(page);

		await page.goto('/latest/world/1?shared=1');
		await expect(sharedBanner(page)).toBeVisible({ timeout: 60_000 });
		const content = storyContent(page, shared!);
		await expect(content).toBeVisible();
		const sharedUrl = page.url();
		const announcer = page.getByTestId('keyboard-selection-announcer');

		for (const key of ['j', 'j', 'k', 'G', 'g', 'g']) await page.keyboard.press(key);
		await expect(announcer).toHaveText('');
		await expect(page.locator('article[aria-current="true"]')).toHaveCount(0);

		for (const key of ['Enter', 'o', 'x']) await page.keyboard.press(key);
		await expect(content).toBeVisible();
		expect(page.url()).toBe(sharedUrl);

		await page.getByRole('button', { name: 'View latest stories', exact: true }).click();
		await expect(sharedBanner(page)).toHaveCount(0);
		const firstCard = page.locator(`article#story-${first!.cluster_number}`);
		await expect(firstCard).toBeVisible({ timeout: 60_000 });
		await blurFocus(page);
		await page.keyboard.press('j');
		await expect(announcer).toHaveText(`Selected story: ${first!.title}`);
		await expect(firstCard).toHaveAttribute('aria-current', 'true');
		const firstToggle = storyToggle(firstCard, first!.title!);
		await page.keyboard.press('Enter');
		await expect(firstToggle).toHaveAttribute('aria-expanded', 'true');
		await page.keyboard.press('x');
		await expect(firstToggle).toHaveAttribute('aria-expanded', 'false');
	});

	test('browser Back into the shared view drops a selection made on the Brief, so Enter / x keep the shared story open', async ({
		page,
	}) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });
		const [first, shared] = await loadOwnedStories(page);

		await page.goto('/latest/world/1?shared=1');
		await expect(sharedBanner(page)).toBeVisible({ timeout: 60_000 });

		// A same-origin link click is a client-side navigation with its own history entry.
		await page.evaluate(() => {
			const link = document.createElement('a');
			link.href = '/latest/world';
			link.textContent = 'Open the Brief';
			document.body.append(link);
		});
		await page.getByRole('link', { name: 'Open the Brief', exact: true }).click();
		await expect(sharedBanner(page)).toHaveCount(0);
		await expect(page.locator(`article#story-${first!.cluster_number}`)).toBeVisible({
			timeout: 60_000,
		});
		await blurFocus(page);
		const announcer = page.getByTestId('keyboard-selection-announcer');
		await page.keyboard.press('j');
		await expect(announcer).toHaveText(`Selected story: ${first!.title}`);

		await page.goBack();
		await expect(sharedBanner(page)).toBeVisible({ timeout: 60_000 });
		const content = storyContent(page, shared!);
		await expect(content).toBeVisible();
		await expect(announcer).toHaveText('');
		await expect(page.locator('article[aria-current="true"]')).toHaveCount(0);

		for (const key of ['Enter', 'x']) await page.keyboard.press(key);
		await expect(content).toBeVisible();
	});
});

test.describe('Shared link to a missing story (NEWS-140)', () => {
	test.beforeEach(() => useScenario('topics'));

	test('leaves the shared view with a not-found notice: the Brief shows, its cards open, and the URL drops ?shared=1', async ({
		page,
	}) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });
		const stories = await loadOwnedStories(page);
		const first = stories[0]!;

		await page.goto(`/latest/world/${stories.length + 50}?shared=1`);
		await expect(
			page.getByRole('alert').filter({ hasText: "The shared story couldn't be found" }),
		).toBeVisible({ timeout: 60_000 });
		await expect(sharedBanner(page)).toHaveCount(0);
		await expect(page).not.toHaveURL(/[?&]shared=1/);
		await expect(page.getByTestId('topic-brief-section').first()).toBeVisible();

		const toggle = storyToggle(page.locator(`article#story-${first.cluster_number}`), first.title!);
		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(storyContent(page, first)).toBeVisible();
		await expect(page).not.toHaveURL(/[?&]shared=1/);
	});
});

test.describe('Keyboard selection follows the plain story list (NEWS-137)', () => {
	test.beforeEach(() => useScenario('topics'));

	async function hideTitles(page: Page, titles: string[]): Promise<void> {
		await page.addInitScript((keywords) => {
			localStorage.setItem(
				'kite-content-filter',
				JSON.stringify({ keywords, filterMode: 'hide', filterScope: 'title', version: 1 }),
			);
		}, titles.map((title) => title.toLowerCase()));
	}

	function expectSelection(page: Page) {
		const announcer = page.getByTestId('keyboard-selection-announcer');
		const selectedCard = page.locator('article[aria-current="true"]');
		return async (title: string) => {
			await expect(announcer).toHaveText(`Selected story: ${title}`);
			await expect(selectedCard).toHaveCount(1);
			await expect(storyToggle(selectedCard, title)).toBeVisible();
		};
	}

	test('with the story-count cap and a hide filter, j / k / G / gg walk the shown cards; Enter / x / m act on the selected card', async ({
		page,
	}) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });
		const stories = await loadOwnedStories(page);
		expect(stories.length).toBeGreaterThan(3);
		const [first, hidden, third] = stories;

		// A failed overview falls back to the plain list, as the fixture Brief does.
		await page.route('**/api/brief/overview', (route) => route.fulfill({ status: 500 }));
		await page.addInitScript(() => localStorage.setItem('storyCount', '3'));
		await hideTitles(page, [hidden!.title!]);
		await page.goto('/');
		const cards = page.locator('article[id^="story-"]');
		await expect(cards).toHaveCount(2, { timeout: 60_000 });
		await expect(page.getByTestId('topic-brief-section')).toHaveCount(0);

		const expectSelected = expectSelection(page);
		await page.keyboard.press('j');
		await expectSelected(first!.title!);
		await page.keyboard.press('j');
		await expectSelected(third!.title!);
		await page.keyboard.press('j');
		await expectSelected(third!.title!);
		await page.keyboard.press('g');
		await page.keyboard.press('g');
		await expectSelected(first!.title!);
		await page.keyboard.press('G');
		await expectSelected(third!.title!);
		await page.keyboard.press('k');
		await expectSelected(first!.title!);
		await page.keyboard.press('j');
		await expectSelected(third!.title!);

		const thirdCard = page.locator(`article#story-${third!.cluster_number}`);
		const firstCard = page.locator(`article#story-${first!.cluster_number}`);
		// m first: opening a story marks it read on its own.
		await page.keyboard.press('m');
		await expect(thirdCard.getByRole('button', { name: 'Mark as unread' })).toBeVisible();
		await expect(firstCard.getByRole('button', { name: 'Mark as read' })).toBeVisible();

		const thirdToggle = storyToggle(thirdCard, third!.title!);
		await page.keyboard.press('Enter');
		await expect(thirdToggle).toHaveAttribute('aria-expanded', 'true');
		await page.keyboard.press('x');
		await expect(thirdToggle).toHaveAttribute('aria-expanded', 'false');
		await page.keyboard.press('o');
		await expect(thirdToggle).toHaveAttribute('aria-expanded', 'true');
		await expect(storyToggle(firstCard, first!.title!)).toHaveAttribute('aria-expanded', 'false');
	});

	test('in single-page mode with a hide filter, j / k / G / gg walk the shown cards in on-screen order', async ({
		page,
	}) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });
		const stories = await loadOwnedStories(page);
		const [first, hidden, third] = stories;
		const last = stories[stories.length - 1]!;
		expect(last.title).not.toBe(hidden!.title);

		await page.addInitScript(() => localStorage.setItem('singlePageMode', 'sequential'));
		await hideTitles(page, [hidden!.title!]);
		await page.goto('/');
		const cards = page.locator('article[id^="story-"]');
		await expect(cards).toHaveCount(stories.length - 1, { timeout: 60_000 });
		await expect(page.getByText(hidden!.title!, { exact: true })).toHaveCount(0);

		const expectSelected = expectSelection(page);
		await page.keyboard.press('j');
		await expectSelected(first!.title!);
		await page.keyboard.press('j');
		await expectSelected(third!.title!);
		await page.keyboard.press('k');
		await expectSelected(first!.title!);
		await page.keyboard.press('G');
		await expectSelected(last.title!);
		await page.keyboard.press('g');
		await page.keyboard.press('g');
		await expectSelected(first!.title!);

		await page.keyboard.press('j');
		await page.keyboard.press('m');
		const thirdCard = page.locator(`article#story-${third!.cluster_number}`);
		await expect(thirdCard.getByRole('button', { name: 'Mark as unread' })).toBeVisible();
	});
});

test.describe('Manual seeds (NEWS-98)', () => {
	test.beforeEach(() => useScenario('topics'));

	test('Add story pins a seed first in its topic; Remove takes it back off', async ({ page }) => {
		const seedTitle = 'Library extends weekend reading-room hours';
		const [grid] = TOPIC_SCENARIO.sections;
		await logIn(page);
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });

		const gridSection = page
			.getByTestId('topic-brief-section')
			.filter({ has: page.getByRole('heading', { name: grid!.name, exact: true }) });
		const firstCard = gridSection.locator('article[id^="story-"]').first();
		await expect(firstCard).toContainText(TOPIC_SCENARIO.lessLikeThis.title, { timeout: 60_000 });
		await expect(page.getByRole('button', { name: /Unaccept/i })).toHaveCount(0);

		await addSeed(page, seedTitle, grid!.name);

		await expect(firstCard).toContainText(seedTitle, { timeout: 30_000 });
		await expect(firstCard.getByText('Added by you', { exact: true })).toBeVisible();
		await expect(
			firstCard.getByText('Summary loads when you open this story', { exact: true }),
		).toBeVisible();

		await storyToggle(firstCard, seedTitle).click();
		const remove = firstCard.getByTestId('seed-remove');
		await expect(remove).toBeVisible();
		await expect(page.getByRole('button', { name: /Unaccept/i })).toHaveCount(0);
		await remove.click();
		await expect(gridSection.getByText(seedTitle)).toHaveCount(0);

		await page.reload();
		await expect(firstCard).toContainText(TOPIC_SCENARIO.lessLikeThis.title, { timeout: 60_000 });
		await expect(page.getByText(seedTitle)).toHaveCount(0);
		await expect(
			gridSection.getByRole('button', { name: `More (${TOPIC_SCENARIO.gridMoreCount})` }),
		).toBeVisible();
	});
});

test.describe('Keyboard selection stays on its story when the Brief list changes (NEWS-138)', () => {
	test.beforeEach(() => useScenario('topics'));

	const seedTitle = 'Library extends weekend reading-room hours';

	/** Signed in, with a seed pinned first in the first topic section; returns that section's cards. */
	async function briefWithSeed(page: Page): Promise<Locator> {
		const [grid] = TOPIC_SCENARIO.sections;
		await logIn(page);
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });
		const gridSection = page
			.getByTestId('topic-brief-section')
			.filter({ has: page.getByRole('heading', { name: grid!.name, exact: true }) });
		const cards = gridSection.locator('article[id^="story-"]');
		await expect(cards.first()).toContainText(TOPIC_SCENARIO.lessLikeThis.title, {
			timeout: 60_000,
		});
		await addSeed(page, seedTitle, grid!.name);
		await expect(cards.first()).toContainText(seedTitle, { timeout: 30_000 });
		await blurFocus(page);
		return cards;
	}

	test('Remove on a seed above the j-selected story keeps that story selected, with nothing announced', async ({
		page,
	}) => {
		const cards = await briefWithSeed(page);
		const chosen = TOPIC_SCENARIO.lessLikeThis.title;
		await expect(cards.nth(1)).toContainText(chosen);
		const announcer = page.getByTestId('keyboard-selection-announcer');
		const selectedCard = page.locator('article[aria-current="true"]');

		await page.keyboard.press('j');
		await page.keyboard.press('j');
		await expect(announcer).toHaveText(`Selected story: ${chosen}`);

		await announcer.evaluate((el) => {
			const record: string[] = [];
			(window as unknown as { announced: string[] }).announced = record;
			new MutationObserver(() => record.push(el.textContent ?? '')).observe(el, {
				childList: true,
				characterData: true,
				subtree: true,
			});
		});
		await storyToggle(cards.first(), seedTitle).click();
		await cards.first().getByTestId('seed-remove').click();
		await expect(page.getByText(seedTitle, { exact: true })).toHaveCount(0);
		await blurFocus(page);

		await expect(selectedCard).toHaveCount(1);
		await expect(storyToggle(selectedCard, chosen)).toBeVisible();
		await expect(announcer).toHaveText(`Selected story: ${chosen}`);
		expect(
			await page.evaluate(() => (window as unknown as { announced: string[] }).announced),
		).toEqual([]);

		await page.keyboard.press('Enter');
		await expect(storyToggle(selectedCard, chosen)).toHaveAttribute('aria-expanded', 'true');
	});

	test('Remove on the j-selected seed clears the selection instead of moving it to the next story', async ({
		page,
	}) => {
		const cards = await briefWithSeed(page);
		const announcer = page.getByTestId('keyboard-selection-announcer');

		await page.keyboard.press('j');
		await expect(announcer).toHaveText(`Selected story: ${seedTitle}`);
		await page.keyboard.press('Enter');
		await cards.first().getByTestId('seed-remove').click();
		await expect(page.getByText(seedTitle, { exact: true })).toHaveCount(0);

		await expect(announcer).toHaveText('');
		await expect(page.locator('article[aria-current]')).toHaveCount(0);
	});
});

test.describe('Owned brief fixture (NEWS-44, NEWS-51)', () => {
	test.beforeEach(() => useScenario('empty'));

	test('empty store serves the enriched fixture cluster without kite.kagi.com', async ({
		page,
	}) => {
		const kagiHosts = watchKagiRequests(page);
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });

		const overviewRes = await page.request.get('/api/brief/overview');
		expect(overviewRes.ok()).toBeTruthy();
		expect(((await overviewRes.json()) as BriefOverview).fixture).toBe(true);

		const stories = await loadOwnedStories(page);
		expect(stories.length).toBeGreaterThan(0);
		const story = stories[0]!;
		expect(story.title).toBeTruthy();
		expect(story.primary_image?.url).toBeTruthy();
		expect(story.primary_image?.caption?.trim().length ?? 0).toBeGreaterThan(0);
		expect(story.talking_points?.length ?? 0).toBeGreaterThan(0);
		expect(story.timeline?.length ?? 0).toBeGreaterThan(0);
		expect(story.suggested_qna?.length ?? 0).toBeGreaterThan(0);
		expect(story.domains?.length ?? 0).toBeGreaterThan(0);
		expect(story.articles?.length ?? 0).toBeGreaterThan(1);
		expect(story.perspectives?.length ?? 0).toBeGreaterThan(0);
		expect(story.cluster_number, 'expected an enriched story to open').toBeTruthy();

		const storyCard = page.locator(`article#story-${story.cluster_number}`);
		await expect(storyCard).toBeVisible({ timeout: 60_000 });
		await storyCard.scrollIntoViewIfNeeded();
		await storyToggle(storyCard, story.title!).click();
		await expect(page.getByText('AI-assisted — not ground truth.')).toBeVisible({
			timeout: 60_000,
		});

		expect(kagiHosts, `unexpected kite.kagi.com requests: ${kagiHosts.join(', ')}`).toEqual([]);
	});
});

test.describe('Kagi service cleanup (NEWS-47)', () => {
	test('Settings has no Upgrade to Kagi, Account sync, or Kagi Maps', async ({
		page,
	}) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });
		await expect(page.getByText('Informed News').first()).toBeVisible({
			timeout: 60_000,
		});

		await page.getByRole('button', { name: /settings/i }).click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible({ timeout: 15_000 });

		await expect(dialog.getByRole('tab', { name: /^Account$/i })).toHaveCount(0);
		await expect(dialog.getByText('Upgrade to Kagi')).toHaveCount(0);
		await expect(dialog.getByText(/sign in to your Kagi account/i)).toHaveCount(
			0,
		);

		await dialog.getByRole('tab', { name: /^Language$/i }).click();
		await expect(dialog.getByText('Upgrade to Kagi')).toHaveCount(0);
		await expect(dialog.getByText(/Kagi subscribers/i)).toHaveCount(0);

		await dialog.getByRole('tab', { name: /^Stories$/i }).click();
		await expect(dialog.getByText('Kagi Maps')).toHaveCount(0);

		await dialog.getByRole('tab', { name: /^About$/i }).click();
		await expect(dialog.getByText(/Kagi Inc/i)).toHaveCount(0);
		await expect(dialog.getByText(/Get it on Google Play/i)).toHaveCount(0);
	});
});

test.describe('Nav shell (NEWS-42)', () => {
	test('Brief stays default; Transparency link works; no empty layer tabs', async ({
		page,
	}) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News|News Briefs|World/i, { timeout: 60_000 });
		await expect(page.getByText('Informed News').first()).toBeVisible({
			timeout: 60_000,
		});

		await expect(page.getByRole('link', { name: /^Finance$/i })).toHaveCount(0);
		await expect(page.getByRole('link', { name: /^Situation$/i })).toHaveCount(
			0,
		);
		await expect(page.getByRole('link', { name: /^Listen$/i })).toHaveCount(0);

		const transparency = page.getByRole('link', { name: /^Transparency$/i });
		await transparency.scrollIntoViewIfNeeded();
		await transparency.click();
		await expect(page).toHaveURL(/\/transparency\/?$/);
		await expect(page.getByRole('heading', { name: 'Transparency' })).toBeVisible();
		await expect(page.getByRole('link', { name: /Back to Brief/i })).toBeVisible();
	});

	test('/radar redirects to /topics', async ({ page }) => {
		await page.goto('/radar');
		await expect(page).toHaveURL(/\/topics\/?$/, { timeout: 60_000 });
		await expect(page.getByRole('heading', { name: 'Topics', exact: true })).toBeVisible({
			timeout: 60_000,
		});
	});

	test('Brief footer has no /radar link', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('link', { name: /^Topics$/i })).toBeVisible({
			timeout: 60_000,
		});
		await expect(page.locator('footer a[href="/radar"]')).toHaveCount(0);
	});

	test('/topics loads session shell with Topics title', async ({ page }) => {
		await page.goto('/topics');
		await expect(page).toHaveTitle(/Topics/i, { timeout: 60_000 });
		await expect(page.getByRole('heading', { name: 'Topics', exact: true })).toBeVisible({
			timeout: 60_000,
		});
	});

	test('/topics signed-in: add, edit, move, and remove a topic', async ({ page }) => {
		const name = `E2E Topics ${Date.now()}`;
		const renamed = `${name} renamed`;
		await logIn(page);
		await page.goto('/topics');
		await expect(page.getByRole('heading', { name: 'Add topic' })).toBeVisible({
			timeout: 60_000,
		});

		const addSection = page.locator('section[aria-labelledby="topics-add-title"]');
		await addSection.getByLabel('Name', { exact: true }).fill(name);
		await addSection.getByRole('button', { name: 'Add topic', exact: true }).click();

		const watch = page.locator('section[aria-labelledby="topics-watch"]');
		const card = watch.getByRole('article', { name });
		await expect(card).toBeVisible({ timeout: 60_000 });

		await card.getByRole('button', { name: 'Move to Core', exact: true }).click();
		const core = page.locator('section[aria-labelledby="topics-core"]');
		const coreCard = core.getByRole('article', { name });
		await expect(coreCard).toBeVisible({ timeout: 60_000 });

		await coreCard.getByRole('button', { name: 'Edit', exact: true }).click();
		await expect(coreCard.locator('button', { hasText: 'Edit' })).toHaveAttribute(
			'aria-expanded',
			'true',
		);
		await coreCard.getByLabel('Name', { exact: true }).fill(renamed);
		await coreCard.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(core.getByRole('article', { name: renamed })).toBeVisible({ timeout: 60_000 });

		page.once('dialog', (dialog) => dialog.accept());
		await core.getByRole('article', { name: renamed }).getByRole('button', { name: 'Remove' }).click();
		await expect(core.getByRole('article', { name: renamed })).toHaveCount(0, { timeout: 60_000 });

		const muteKeyword = `e2e-mute-${Date.now()}`;
		const mutes = page.locator('section[aria-labelledby="topics-mutes-title"]');
		await mutes.getByLabel('Keyword', { exact: true }).fill(muteKeyword);
		await mutes.getByRole('button', { name: 'Mute', exact: true }).click();
		const muteRow = mutes.locator('li', { hasText: muteKeyword });
		await expect(muteRow).toBeVisible({ timeout: 60_000 });
		await muteRow.getByRole('button', { name: 'Delete', exact: true }).click();
		await expect(mutes.locator('li', { hasText: muteKeyword })).toHaveCount(0, {
			timeout: 60_000,
		});
	});

	test('dated batch/category deep links and /contribute render', async ({ page }) => {
		for (const path of ['/2026-09-30/world', '/contribute']) {
			const res = await page.goto(path);
			expect(res?.status(), path).toBe(200);
		}
	});
});

test.describe('Transparency page (NEWS-32)', () => {
	test('public page shows funding, methodology, corrections, and team', async ({
		page,
	}) => {
		await page.goto('/transparency');
		await expect(page).toHaveTitle(/Transparency/i, { timeout: 60_000 });
		await expect(page.getByRole('heading', { name: 'Transparency' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Funding' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Methodology' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Corrections' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible();
		await expect(page.getByText(/AI-assisted/i).first()).toBeVisible();
		await expect(page.getByText(/not ground truth/i).first()).toBeVisible();
		await expect(page.getByText(/Sandiebeach LLC/i).first()).toBeVisible();
		await expect(page.getByText(/Phil Clapper/i).first()).toBeVisible();
		await expect(page.locator('body')).not.toContainText('perfectly unbiased');
		await expect(page.locator('body')).not.toContainText('we are an unbiased');
	});
});

test.describe('MVP API compat (NEWS-43)', () => {
	const apiBase = `http://127.0.0.1:${E2E_API_PORT}`;

	test.beforeEach(() => useScenario('topics'));

	test('health is public; articles JSON reachable with session while Kite runs', async ({
		page,
		request,
	}) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News|News Briefs|World/i, { timeout: 60_000 });

		const health = await request.get(`${apiBase}/health`);
		expect(health.ok()).toBeTruthy();
		const healthBody = await health.json();
		expect(healthBody.status).toBe('ok');
		expect(healthBody.app).toBe('mvp-server');

		const login = await request.post(`${apiBase}/api/login`, {
			data: { password: E2E_MVP_PASSWORD },
		});
		expect(login.ok()).toBeTruthy();

		const articlesRes = await request.get(`${apiBase}/api/articles`);
		expect(articlesRes.ok()).toBeTruthy();
		const articlesBody = (await articlesRes.json()) as { articles: Array<{ id: string }> };
		expect(articlesBody.articles.length).toBeGreaterThan(0);

		const id = articlesBody.articles[0]!.id;
		const one = await request.get(`${apiBase}/api/articles/${id}`);
		expect(one.ok()).toBeTruthy();
		const oneBody = await one.json();
		expect(oneBody.article?.id).toBe(id);
	});
});
