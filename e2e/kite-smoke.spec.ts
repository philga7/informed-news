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
		await expect(page.getByText(/AI-assisted analysis/i)).toBeVisible();
		await expect(page.getByRole('link', { name: /Back to Brief/i })).toBeVisible();
	});
});
