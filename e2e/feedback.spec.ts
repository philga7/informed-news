import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { E2E_DATA_DIR, E2E_KITE_PORT, E2E_MVP_PASSWORD } from './stack/config.mjs';
import { TOPIC_SCENARIO, writeScenario } from './stack/scenarios.mjs';

const LIKED_TITLE = TOPIC_SCENARIO.lessLikeThis.title;
const FILTERED_TITLE = 'You will not believe what this battery can do';
const LIKED_COMMENT = 'Keep this grid story';
const FILTERED_COMMENT = 'Skip this battery headline';
const EDITED_COMMENT = 'Keep this grid story, with a note';

type StubResult = {
	promptIds: string[];
	citedId: string | null;
	articleId: string | null;
	title: string | null;
};

async function logIn(page: Page): Promise<void> {
	const login = await page.request.post('/api/login', { data: { password: E2E_MVP_PASSWORD } });
	expect(login.ok()).toBeTruthy();
}

function stubRefresh(cite: boolean): StubResult {
	const tsx = path.join(process.cwd(), 'mvp/server/node_modules/.bin/tsx');
	const script = path.join(process.cwd(), 'e2e/stack/stubFeedbackRefresh.ts');
	const result = spawnSync(tsx, [script, ...(cite ? ['--cite'] : [])], {
		cwd: process.cwd(),
		env: { ...process.env, MVP_DATA_DIR: E2E_DATA_DIR },
		encoding: 'utf8',
	});
	expect(result.status, result.stderr || result.stdout).toBe(0);
	const line = result.stdout.trim().split('\n').filter(Boolean).at(-1);
	expect(line, result.stdout).toBeTruthy();
	return JSON.parse(line!) as StubResult;
}

test.afterAll(() => {
	writeScenario(E2E_DATA_DIR, 'topics', { imageBaseUrl: `http://localhost:${E2E_KITE_PORT}` });
});

test('feedback list, citation link, and stubbed refresh prompt', async ({ page }) => {
	test.setTimeout(180_000);
	await logIn(page);
	await page.goto('/');
	await expect(page).toHaveTitle(/Informed News/i, { timeout: 60_000 });

	const approved = page.locator('article').filter({ hasText: LIKED_TITLE }).first();
	await expect(approved).toBeVisible({ timeout: 60_000 });
	await approved.getByRole('button', { name: LIKED_TITLE, exact: true }).click();
	await approved.getByRole('button', { name: 'Like', exact: true }).click();
	await approved.getByLabel('Comment (optional)').fill(LIKED_COMMENT);
	await approved.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(approved.getByRole('button', { name: 'Like', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
	);

	await page.getByTestId('brief-verdict-view').getByRole('button', { name: 'Filtered', exact: true }).click();
	const filtered = page.getByTestId('brief-filtered-verdict-card').filter({ hasText: FILTERED_TITLE });
	await expect(filtered).toBeVisible();
	await filtered.getByRole('button', { name: 'Not relevant', exact: true }).click();
	await filtered.getByLabel('Comment (optional)').fill(FILTERED_COMMENT);
	await filtered.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(filtered.getByRole('button', { name: 'Not relevant', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
	);

	await page.getByTestId('brief-feedback-link').click();
	await expect(page).toHaveURL(/\/feedback\/?$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Feedback' })).toBeVisible();
	const liked = page.getByTestId('feedback-entry').filter({ hasText: LIKED_TITLE });
	const skipped = page.getByTestId('feedback-entry').filter({ hasText: FILTERED_TITLE });
	await expect(liked).toBeVisible();
	await expect(skipped).toBeVisible();
	await expect(liked).toContainText(LIKED_COMMENT);
	await expect(skipped).toContainText(FILTERED_COMMENT);

	await liked.getByRole('button', { name: 'Edit comment', exact: true }).click();
	await liked.getByLabel('Comment (optional)').fill(EDITED_COMMENT);
	await liked.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(liked).toContainText(EDITED_COMMENT);

	await liked.getByRole('button', { name: 'Delete', exact: true }).click();
	await liked.getByRole('button', { name: 'No', exact: true }).click();
	await expect(liked).toBeVisible();

	const likedId = await liked.evaluate((node) => node.id);
	const cited = stubRefresh(true);
	expect(cited.promptIds).toContain(likedId);
	expect(cited.citedId).toBe(likedId);
	expect(cited.title).toBeTruthy();

	await page.goto('/');
	await page.getByTestId('brief-verdict-view').getByRole('button', { name: 'Filtered', exact: true }).click();
	const citedCard = page.getByTestId('brief-filtered-verdict-card').filter({ hasText: cited.title! });
	await expect(citedCard).toBeVisible({ timeout: 60_000 });
	await citedCard.getByText('Why this verdict', { exact: true }).click();
	const link = citedCard.getByTestId('feedback-criteria-link');
	await expect(link).toHaveText(`feedback:${likedId}`);
	await expect(link).toHaveAttribute('href', `/feedback#${likedId}`);
	await link.click();
	await expect(page).toHaveURL(new RegExp(`/feedback#${likedId}$`));
	const target = page.locator(`article[id="${likedId}"]`);
	await expect(target).toBeFocused();
	await expect(target).toHaveClass(/feedback-highlight/);

	await target.getByRole('button', { name: 'Delete', exact: true }).click();
	await target.getByRole('button', { name: 'Yes', exact: true }).click();
	await expect(target).toHaveCount(0);

	const after = stubRefresh(false);
	expect(after.promptIds).not.toContain(likedId);

	await page.goto('/');
	await page.getByTestId('brief-verdict-view').getByRole('button', { name: 'Filtered', exact: true }).click();
	const again = page.getByTestId('brief-filtered-verdict-card').filter({ hasText: cited.title! });
	await again.getByText('Why this verdict', { exact: true }).click();
	const region = again.getByRole('region', { name: 'Advisory triage reason' });
	await expect(region).toContainText(/Reader feedback|Off-topic|off.topic|Filtered/i);
	await expect(again.getByTestId('feedback-criteria-removed')).toHaveText('feedback removed');
	await expect(again.getByTestId('feedback-criteria-link')).toHaveCount(0);

	await page.goto('/feedback');
	await expect(page.getByRole('heading', { level: 1, name: 'Feedback' })).toBeVisible();
	const remaining = page.getByTestId('feedback-entry').filter({ hasText: FILTERED_TITLE });
	await expect(remaining).toBeVisible();
	await expect(remaining).toHaveAttribute('aria-labelledby', /.+/);
	await expect(remaining.getByRole('button', { name: 'Like', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false',
	);
	await expect(remaining.getByRole('button', { name: 'Not relevant', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	const remove = remaining.getByRole('button', { name: 'Delete', exact: true });
	await remove.focus();
	await page.keyboard.press('Enter');
	await expect(remaining.getByRole('button', { name: 'Yes', exact: true })).toBeVisible();
	await expect(remaining.getByRole('button', { name: 'No', exact: true })).toBeVisible();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await remaining.getByRole('button', { name: 'No', exact: true }).click();
});
