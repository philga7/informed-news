import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const TYPES = ['feat', 'fix', 'perf', 'refactor', 'revert', 'docs', 'chore', 'ci', 'test', 'style', 'build'];
const KEYLESS_TYPES = new Set(['docs', 'chore', 'ci', 'test', 'style', 'build']);
const HEADER = /^([a-z]+)(?:\(([^()]*)\))?(!)?: (\S.*)$/;
const KEY = /NEWS-\d+/i;
const KEYS_ONLY_SCOPE = /^NEWS-\d+(?:, ?NEWS-\d+)*$/;

const RULE =
	'PR titles become the squash subject on main, so they must be a Conventional Commit ' +
	'with every ticket key in the scope, e.g. "fix(NEWS-131, NEWS-155): …" ' +
	'(CONTRIBUTING.md § Squash merges and semantic-release).';

/** Returns the reasons `title` breaks the PR-title rule; empty when it passes. */
export function checkPrTitle(title) {
	const match = HEADER.exec(title.trim());
	if (!match) return ['Title is not a Conventional Commit: "<type>(<scope>)!: <subject>".'];

	const [, type, scope, breaking, subject] = match;
	const errors = [];
	if (!TYPES.includes(type)) errors.push(`Unknown type "${type}"; use one of ${TYPES.join(', ')}.`);
	if (KEY.test(subject)) errors.push('Ticket keys go in the scope, not the subject.');

	const hasKeys = scope !== undefined && KEY.test(scope);
	if (hasKeys && !KEYS_ONLY_SCOPE.test(scope)) {
		errors.push('A scope with ticket keys lists only keys, comma-separated: "NEWS-1, NEWS-2".');
	}
	if (!hasKeys && (breaking || !KEYLESS_TYPES.has(type))) {
		errors.push(`"${type}${breaking ?? ''}" cuts a release, so the scope must list every NEWS key.`);
	}
	return errors;
}

function isMain() {
	return process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
}

if (isMain()) {
	const title = process.env.PR_TITLE ?? '';
	const errors = checkPrTitle(title);
	if (errors.length > 0) {
		console.error(`PR title: ${JSON.stringify(title)}`);
		for (const error of errors) console.error(`- ${error}`);
		console.error(RULE);
		process.exit(1);
	}
	console.log(`PR title OK: ${title}`);
}
