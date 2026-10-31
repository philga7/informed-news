import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const skillsDir = join(root, '.cursor/skills');

function markdownFiles(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return markdownFiles(path);
		return entry.name.endsWith('.md') ? [path] : [];
	});
}

/** Relative markdown link targets outside fenced code blocks, without #anchors. */
function relativeLinks(text) {
	const prose = text.replace(/```[\s\S]*?```/g, '');
	return [...prose.matchAll(/\]\(([^)\s]+)\)/g)]
		.map((match) => match[1])
		.filter((target) => !/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(target))
		.map((target) => target.split('#')[0])
		.filter(Boolean);
}

function skillFolder(file) {
	return join(skillsDir, relative(skillsDir, file).split(sep)[0]);
}

describe('NEWS-131 skill links that leave their skill folder resolve', () => {
	it('every such link points at a file that exists', () => {
		const broken = [];
		for (const file of markdownFiles(skillsDir)) {
			const ownFolder = skillFolder(file) + sep;
			for (const target of relativeLinks(readFileSync(file, 'utf8'))) {
				const resolved = resolve(dirname(file), decodeURI(target));
				if (resolved.startsWith(ownFolder)) continue;
				if (!existsSync(resolved)) {
					broken.push(`${relative(root, file)} -> ${target}`);
				}
			}
		}
		assert.deepEqual(broken, []);
	});

	it('news-ship-loop links docs/ROADMAP.md from the repo root', () => {
		const skill = readFileSync(join(skillsDir, 'news-ship-loop/SKILL.md'), 'utf8');
		assert.match(skill, /\]\(\.\.\/\.\.\/\.\.\/docs\/ROADMAP\.md\)/);
		assert.doesNotMatch(skill, /\]\(\.\.\/\.\.\/docs\//);
	});

	it('news-ship-loop updates the spec only when behavior changes', () => {
		const skill = readFileSync(join(skillsDir, 'news-ship-loop/SKILL.md'), 'utf8');
		assert.match(skill, /Update it only when what a reader can do changes/);
		assert.match(skill, /Do not bump \*\*Last checked\*\*/);
		assert.match(skill, /what is true at merge/);
		assert.match(skill, /pull request body/);
		assert.match(skill, /no longer true/);
		assert.match(skill, /5 more pull requests/);
		assert.doesNotMatch(skill, /bump \*\*Last checked\*\* so the file is still in the diff/);
	});
});
