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
		expect(catBody.categories?.[0]?.categoryId).toBe('inbox');
		const categoryUuid = catBody.categories[0].id as string;

		const stories = await page.request.get(
			`/api/batches/${batch.id}/categories/${categoryUuid}/stories?limit=12`,
		);
		expect(stories.ok()).toBeTruthy();
		const storiesBody = await stories.json();
		expect(Array.isArray(storiesBody.stories)).toBeTruthy();
		expect(storiesBody.stories.length).toBeGreaterThan(0);
		expect(storiesBody.stories[0].title).toBeTruthy();

		expect(
			kagiHosts,
			`unexpected kite.kagi.com requests: ${kagiHosts.join(', ')}`,
		).toEqual([]);
	});
});
