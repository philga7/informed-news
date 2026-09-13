import { expect, test } from '@playwright/test';

test.describe('Kite vendored UI (NEWS-40)', () => {
	test('Brief shell loads on documented port', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Kite|Kagi|News/i, { timeout: 60_000 });
		// Shell chrome from upstream Header / main layout should be present.
		await expect(page.locator('body')).toBeVisible();
		const html = await page.content();
		expect(html.length).toBeGreaterThan(500);
	});
});
