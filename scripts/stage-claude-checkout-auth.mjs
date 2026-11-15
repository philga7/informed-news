import { spawnSync } from 'node:child_process';

// actions/checkout@v7 stores the workflow token as http.extraheader behind
// includeIf.gitdir. claude-code-action@v1 only clears include.path, so that
// header wins over the app token and git push is github-actions[bot].
// This step removes those headers and puts the workflow token on the origin
// URL so the action can still fetch. The action then replaces the URL with
// its own app token. Do not pass that app token in here, and do not print it.

const EXTRA_KEYS = ['http.https://github.com/.extraheader', 'http.extraheader'];
const INCLUDE_KEYS = /^(include\.path|includeif\.gitdir:.*\.path)$/i;

const token = process.env.GITHUB_TOKEN ?? '';

function redact(text) {
	if (!text) return '';
	let out = text;
	if (token) out = out.split(token).join('[redacted]');
	const encoded = token ? encodeURIComponent(token) : '';
	if (encoded && encoded !== token) out = out.split(encoded).join('[redacted]');
	return out;
}

function git(args, { allowFail = false } = {}) {
	const result = spawnSync('git', args, { encoding: 'utf8' });
	if (result.error) {
		console.error(redact(result.error.message));
		process.exit(1);
	}
	if (!allowFail && result.status !== 0) {
		const err = redact((result.stderr || '').trim());
		console.error(err || `git ${args[0]} failed`);
		process.exit(result.status || 1);
	}
	return result;
}

function includedFiles() {
	const listed = git(['config', '--local', '--get-regexp', INCLUDE_KEYS.source], { allowFail: true });
	if (listed.status !== 0) return [];
	const files = new Set();
	for (const line of listed.stdout.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const space = trimmed.indexOf(' ');
		if (space < 0) continue;
		const key = trimmed.slice(0, space);
		if (!INCLUDE_KEYS.test(key)) continue;
		const path = trimmed.slice(space + 1).trim();
		if (path) files.add(path);
	}
	return [...files];
}

function stripExtraHeaders(files) {
	for (const key of EXTRA_KEYS) {
		git(['config', '--local', '--unset-all', key], { allowFail: true });
	}
	for (const file of files) {
		for (const key of EXTRA_KEYS) {
			git(['config', '--file', file, '--unset-all', key], { allowFail: true });
		}
	}
}

function assertNoExtraHeader(files) {
	// --list includes global and system config. A header there fails this
	// step on purpose: it would still authenticate the later push.
	const listed = git(['config', '--list', '--show-origin'], { allowFail: true });
	const effective = `${listed.stdout || ''}\n${listed.stderr || ''}`;
	if (effective.toLowerCase().includes('extraheader')) {
		console.error('checkout authorization header is still set');
		process.exit(1);
	}
	for (const file of files) {
		const shown = git(['config', '--file', file, '--list'], { allowFail: true });
		const body = `${shown.stdout || ''}\n${shown.stderr || ''}`;
		if (body.toLowerCase().includes('extraheader')) {
			console.error('an included git config still has an authorization header');
			process.exit(1);
		}
	}
}

function parseOrigin(url) {
	if (!url.startsWith('https://')) {
		console.error('origin must be an https URL');
		process.exit(1);
	}
	const rest = url.slice('https://'.length);
	const slash = rest.indexOf('/');
	if (slash < 0) {
		console.error('origin must include an owner and repo');
		process.exit(1);
	}
	let authority = rest.slice(0, slash);
	const at = authority.lastIndexOf('@');
	if (at >= 0) authority = authority.slice(at + 1);
	const repoPath = rest.slice(slash + 1).replace(/\.git$/, '');
	if (authority !== 'github.com') {
		console.error('origin host must be github.com');
		process.exit(1);
	}
	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoPath)) {
		console.error('origin path must be owner/repo');
		process.exit(1);
	}
	return { host: authority, repoPath };
}

if (!token) {
	console.error('GITHUB_TOKEN is required');
	process.exit(1);
}

const origin = git(['remote', 'get-url', 'origin']).stdout.trim();
const { host, repoPath } = parseOrigin(origin);
const files = includedFiles();
stripExtraHeaders(files);
assertNoExtraHeader(files);
const stamped = `https://x-access-token:${encodeURIComponent(token)}@${host}/${repoPath}.git`;
git(['remote', 'set-url', 'origin', stamped]);
