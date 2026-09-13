import { expect, test } from '@playwright/test';

test.describe('Kite default UI (NEWS-41)', () => {
	test('Brief shell loads on documented default port', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Kite|Kagi|News/i, { timeout: 60_000 });
		await expect(page.locator('body')).toBeVisible();
		const html = await page.content();
		expect(html.length).toBeGreaterThan(500);
	});
});
