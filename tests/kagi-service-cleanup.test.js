import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

describe('NEWS-47 Kagi service cleanup', () => {
	it('gates leftover Kagi service features off by default', () => {
		const features = readFileSync(
			join(root, 'apps/kite/src/lib/features.ts'),
			'utf8',
		);
		assert.match(features, /kagiAccountSync: false/);
		assert.match(features, /kagiReadingLevel: false/);
		assert.match(features, /kagiMaps: false/);
		assert.match(features, /kagiAppNavigation: false/);
		assert.match(features, /kagiAssistant: false/);
		assert.match(features, /kagiMobileApps: false/);
	});

	it('hides Account tab and Upgrade-to-Kagi reading-level paywall in default path', () => {
		const settings = readFileSync(
			join(root, 'apps/kite/src/lib/components/Settings.svelte'),
			'utf8',
		);
		const language = readFileSync(
			join(root, 'apps/kite/src/lib/components/settings/SettingsLanguage.svelte'),
			'utf8',
		);
		assert.match(settings, /FEATURES\.kagiAccountSync/);
		assert.doesNotMatch(language, /Upgrade to Kagi/);
		assert.doesNotMatch(language, /kagi\.com\/settings\?p=billing/);
		assert.doesNotMatch(language, /readingLevel/);
	});

	it('does not offer Kagi Maps in Stories settings by default', () => {
		const stories = readFileSync(
			join(root, 'apps/kite/src/lib/components/settings/SettingsStories.svelte'),
			'utf8',
		);
		const maps = readFileSync(
			join(root, 'apps/kite/src/lib/utils/mapsProvider.ts'),
			'utf8',
		);
		assert.match(stories, /FEATURES\.kagiMaps/);
		assert.match(maps, /FEATURES\.kagiMaps/);
		assert.match(
			readFileSync(join(root, 'apps/kite/src/lib/data/settings.svelte.ts'), 'utf8'),
			/mapsProvider', 'google'/,
		);
	});

	it('documents decisions and keeps MIT attribution', () => {
		const doc = readFileSync(join(root, 'docs/KAGI_SERVICE_CLEANUP.md'), 'utf8');
		const license = readFileSync(join(root, 'apps/kite/LICENSE'), 'utf8');
		assert.match(doc, /NEWS-47/);
		assert.match(doc, /Hide/);
		assert.match(license, /MIT License/);
		assert.match(license, /Kagi Search/);
	});
});
