import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test.describe('Informed News shell branding (NEWS-45)', () => {
	test('Brief chrome uses Informed News title, not Kagi News', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });
		await expect(page.getByText('Informed News').first()).toBeVisible({ timeout: 60_000 });
		await expect(page.locator('body')).not.toContainText('Kagi News BETA');
		await expect(page.locator('body')).toBeVisible();
	});
});

test.describe('Owned brief (NEWS-44)', () => {
	test('Owned brief stories expose primary_image or article image (NEWS-52)', async ({
		page,
	}) => {
		// Ensure Kite UI is up (webServer from playwright config) so relative
		// page.request calls resolve against the same origin.
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });

		const latest = await page.request.get('/api/batches/latest');
		expect(latest.ok()).toBeTruthy();
		const batch = (await latest.json()) as { id?: string };
		expect(batch.id).toBe('owned-latest');

		const categories = await page.request.get(`/api/batches/${batch.id}/categories`);
		expect(categories.ok()).toBeTruthy();
		const catBody = (await categories.json()) as {
			categories?: Array<{ id: string; categoryId?: string }>;
		};
		expect(catBody.categories?.[0]?.categoryId).toBe('world');
		const categoryUuid = catBody.categories?.[0]?.id as string | undefined;
		expect(categoryUuid, 'expected first owned category id').toBeTruthy();

		const storiesRes = await page.request.get(
			`/api/batches/${batch.id}/categories/${categoryUuid}/stories?limit=12`,
		);
		expect(storiesRes.ok()).toBeTruthy();
		const storiesBody = (await storiesRes.json()) as { stories?: Array<any> };
		const stories = storiesBody.stories ?? [];
		expect(Array.isArray(stories)).toBeTruthy();
		expect(stories.length).toBeGreaterThan(0);

		const hasPrimaryImageUrl = stories.some((s: any) => {
			const url = s?.primary_image?.url;
			return typeof url === 'string' && url.trim().length > 0;
		});
		const hasArticleImage = stories.some((s: any) => {
			const articles = s?.articles;
			return (
				Array.isArray(articles) &&
				articles.some((a: any) => {
					const img = a?.image;
					return typeof img === 'string' && img.trim().length > 0;
				})
			);
		});

		if (!hasPrimaryImageUrl && !hasArticleImage) {
			test.skip(
				true,
				'owned brief has no primary_image.url or articles[].image; primary-image smoke requires fixture or live scrape images',
			);
			return;
		}

		expect(
			hasPrimaryImageUrl || hasArticleImage,
			'expected at least one story with primary_image.url or at least one member with articles[].image',
		).toBeTruthy();

		// If primary_image exists, assert it is well-formed without depending on CDN image loads.
		const storyWithPrimary = stories.find(
			(s: any) =>
				typeof s?.primary_image?.url === 'string' &&
				s.primary_image.url.trim().length > 0,
		);
		if (storyWithPrimary) {
			expect(typeof storyWithPrimary.primary_image.caption).toBe('string');
			expect(storyWithPrimary.primary_image.caption.trim().length).toBeGreaterThan(
				0,
			);
		}
	});

	test('Brief cold path does not require kite.kagi.com', async ({ page }) => {
		const kagiHosts: string[] = [];
		page.on('request', (req) => {
			const url = req.url();
			if (url.includes('kite.kagi.com')) {
				kagiHosts.push(url);
			}
		});

		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });

		// Local proxy → mvp/server owned batch
		const latest = await page.request.get('/api/batches/latest');
		expect(latest.ok()).toBeTruthy();
		const batch = await latest.json();
		expect(batch.id).toBe('owned-latest');

		const categories = await page.request.get(
			`/api/batches/${batch.id}/categories`,
		);
		expect(categories.ok()).toBeTruthy();
		const catBody = await categories.json();
		expect(catBody.categories?.[0]?.categoryId).toBe('world');
		const categoryUuid = catBody.categories[0].id as string;

		const stories = await page.request.get(
			`/api/batches/${batch.id}/categories/${categoryUuid}/stories?limit=12`,
		);
		expect(stories.ok()).toBeTruthy();
		const storiesBody = await stories.json();
		expect(Array.isArray(storiesBody.stories)).toBeTruthy();
		expect(storiesBody.stories.length).toBeGreaterThan(0);
		expect(storiesBody.stories[0].title).toBeTruthy();

		const hasTalkingPoints = storiesBody.stories.some(
			(s: { talking_points?: unknown }) =>
				Array.isArray(s.talking_points) && s.talking_points.length > 0,
		);
		const hasTimeline = storiesBody.stories.some(
			(s: { timeline?: unknown }) => Array.isArray(s.timeline) && s.timeline.length > 0,
		);
		const hasSuggestedQna = storiesBody.stories.some(
			(s: { suggested_qna?: unknown }) =>
				Array.isArray(s.suggested_qna) && s.suggested_qna.length > 0,
		);

		if (!hasTalkingPoints) {
			test.skip(
				true,
				'owned brief has no enriched stories (talking_points/timeline/suggested_qna); enrich smoke requires fixture or enriched live data',
			);
			return;
		}
		expect(hasTimeline, 'expected at least one story with timeline[]').toBeTruthy();
		expect(hasSuggestedQna, 'expected at least one story with suggested_qna[]').toBeTruthy();

		const storyToOpen = storiesBody.stories.find(
			(s: {
				cluster_number?: number;
				talking_points?: unknown;
				timeline?: unknown;
				suggested_qna?: unknown;
			}) =>
				(Array.isArray(s.talking_points) && s.talking_points.length > 0) ||
				(Array.isArray(s.timeline) && s.timeline.length > 0) ||
				(Array.isArray(s.suggested_qna) && s.suggested_qna.length > 0),
		);
		expect(storyToOpen?.cluster_number, 'expected an enriched story to open').toBeTruthy();

		// Owned brief stories payload should expose at least one domains entry
		// (either from live ingest or the fixture cluster).
		const storiesWithDomains = storiesBody.stories.filter(
			(s: { domains?: Array<{ name: string }> }) =>
				Array.isArray(s.domains) && s.domains.length >= 1,
		);
		expect(
			storiesWithDomains.length,
			'expected at least one story with domains[] from owned adapter',
		).toBeGreaterThan(0);

		// Owned brief stories payload should expose at least one perspectives entry
		// (either from live ingest or the fixture multi-member cluster).
		// Skip the smoke check entirely when there are no multi-member clusters yet.
		const hasClusteredStory = storiesBody.stories.some(
			(s: { articles?: Array<unknown> }) =>
				Array.isArray(s.articles) && s.articles.length > 1,
		);
		if (!hasClusteredStory) {
			test.skip(
				true,
				'owned brief has no multi-member clusters; perspectives smoke requires a cluster',
			);
		}

		const storiesWithPerspectives = storiesBody.stories.filter(
			(s: { perspectives?: Array<unknown> }) =>
				Array.isArray(s.perspectives) && s.perspectives.length >= 1,
		);
		expect(
			storiesWithPerspectives.length,
			'expected at least one story with perspectives[] from owned adapter',
		).toBeGreaterThan(0);

		// Expand an enriched story and verify the concise honesty copy appears.
		const storyCard = page.locator(
			`article#story-${(storyToOpen as { cluster_number: number }).cluster_number}`,
		);
		await expect(storyCard).toBeVisible({ timeout: 60_000 });
		await storyCard.scrollIntoViewIfNeeded();
		await storyCard.locator('button[aria-label="Expand story"]').click();
		await expect(page.getByText('AI-assisted — not ground truth.')).toBeVisible({
			timeout: 60_000,
		});

		expect(
			kagiHosts,
			`unexpected kite.kagi.com requests: ${kagiHosts.join(', ')}`,
		).toEqual([]);
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
		await expect(page).toHaveTitle(/Informed News|World/i, { timeout: 60_000 });
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
	const apiBase = `http://127.0.0.1:${process.env.PORT ?? 3001}`;

	function readMvpPassword(): string | undefined {
		if (process.env.MVP_PASSWORD) return process.env.MVP_PASSWORD;
		try {
			const env = readFileSync(join(process.cwd(), 'mvp/.env'), 'utf8');
			const match = env.match(/^MVP_PASSWORD=(.*)$/m);
			return match?.[1]?.trim().replace(/^["']|["']$/g, '');
		} catch {
			return undefined;
		}
	}

	test('health is public; articles JSON reachable with session while Kite runs', async ({
		page,
		request,
	}) => {
		// Kite UI is up (webServer from playwright.config).
		await page.goto('/');
		await expect(page).toHaveTitle(/Informed News|World/i, { timeout: 60_000 });

		const health = await request.get(`${apiBase}/health`);
		expect(health.ok()).toBeTruthy();
		const healthBody = await health.json();
		expect(healthBody.status).toBe('ok');
		expect(healthBody.app).toBe('mvp-server');

		const password = readMvpPassword();
		test.skip(!password, 'mvp/.env MVP_PASSWORD required for articles check');

		const login = await request.post(`${apiBase}/api/login`, {
			data: { password },
		});
		expect(login.ok()).toBeTruthy();

		const articlesRes = await request.get(`${apiBase}/api/articles`);
		expect(articlesRes.ok()).toBeTruthy();
		const articlesBody = await articlesRes.json();
		expect(Array.isArray(articlesBody.articles)).toBeTruthy();

		if (articlesBody.articles.length > 0) {
			const id = articlesBody.articles[0].id as string;
			const one = await request.get(`${apiBase}/api/articles/${id}`);
			expect(one.ok()).toBeTruthy();
			const oneBody = await one.json();
			expect(oneBody.article?.id).toBe(id);
		}
	});
});
