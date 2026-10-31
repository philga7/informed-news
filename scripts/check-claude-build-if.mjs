import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(join(root, '.github/workflows/claude.yml'), 'utf8');
const ifMatch = workflow.match(/ {4}if: \|\n([\s\S]*?)\n {4}runs-on:/);
if (!ifMatch) {
	console.error('could not find job if: block');
	process.exit(2);
}
const expression = ifMatch[1].replace(/^ {6}/gm, '').trim();

function tokenize(input) {
	const tokens = [];
	let i = 0;
	while (i < input.length) {
		const c = input[i];
		if (/\s/.test(c)) {
			i += 1;
			continue;
		}
		if (c === '(' || c === ')' || c === ',') {
			tokens.push({ type: c, value: c });
			i += 1;
			continue;
		}
		if (c === "'" || c === '"') {
			const q = c;
			let j = i + 1;
			let s = '';
			while (j < input.length && input[j] !== q) {
				if (input[j] === '\\') {
					s += input[j + 1];
					j += 2;
					continue;
				}
				s += input[j];
				j += 1;
			}
			if (input[j] !== q) throw new Error('unterminated string');
			tokens.push({ type: 'string', value: s });
			i = j + 1;
			continue;
		}
		if (input.startsWith('==', i) || input.startsWith('&&', i) || input.startsWith('||', i)) {
			tokens.push({ type: 'op', value: input.slice(i, i + 2) });
			i += 2;
			continue;
		}
		const ident = input.slice(i).match(/^[A-Za-z_][A-Za-z0-9_.]*/);
		if (ident) {
			tokens.push({ type: 'ident', value: ident[0] });
			i += ident[0].length;
			continue;
		}
		throw new Error(`unexpected ${JSON.stringify(input.slice(i, i + 20))} at ${i}`);
	}
	return tokens;
}

function parse(tokens) {
	let i = 0;
	function peek() {
		return tokens[i];
	}
	function eat(type, value) {
		const t = tokens[i];
		if (!t || t.type !== type || (value !== undefined && t.value !== value)) {
			throw new Error(`expected ${type} ${value ?? ''} got ${JSON.stringify(t)}`);
		}
		i += 1;
		return t;
	}
	function parseOr() {
		let left = parseAnd();
		while (peek()?.type === 'op' && peek().value === '||') {
			eat('op', '||');
			const right = parseAnd();
			left = { type: '||', left, right };
		}
		return left;
	}
	function parseAnd() {
		let left = parseEq();
		while (peek()?.type === 'op' && peek().value === '&&') {
			eat('op', '&&');
			const right = parseEq();
			left = { type: '&&', left, right };
		}
		return left;
	}
	function parseEq() {
		let left = parsePrimary();
		if (peek()?.type === 'op' && peek().value === '==') {
			eat('op', '==');
			const right = parsePrimary();
			left = { type: '==', left, right };
		}
		return left;
	}
	function parsePrimary() {
		const t = peek();
		if (!t) throw new Error('unexpected end');
		if (t.type === '(') {
			eat('(');
			const inner = parseOr();
			eat(')');
			return inner;
		}
		if (t.type === 'string') {
			i += 1;
			return { type: 'string', value: t.value };
		}
		if (t.type === 'ident') {
			i += 1;
			if (peek()?.type === '(') {
				eat('(');
				const args = [];
				if (peek()?.type !== ')') {
					args.push(parseOr());
					while (peek()?.type === ',') {
						eat(',');
						args.push(parseOr());
					}
				}
				eat(')');
				return { type: 'call', name: t.value, args };
			}
			return { type: 'ident', value: t.value };
		}
		throw new Error(`unexpected token ${JSON.stringify(t)}`);
	}
	const ast = parseOr();
	if (i !== tokens.length) throw new Error(`trailing tokens at ${i}`);
	return ast;
}

function lookup(root, path) {
	let cur = root;
	for (const part of path.split('.')) {
		if (cur == null || typeof cur !== 'object') return null;
		cur = cur[part];
	}
	return cur === undefined ? null : cur;
}

function truthy(value) {
	if (value == null || value === false || value === '' || value === 0) return false;
	if (Array.isArray(value) && value.length === 0) return false;
	return true;
}

function evalAst(node, ctx) {
	switch (node.type) {
		case 'string':
			return node.value;
		case 'ident':
			return lookup(ctx, node.value);
		case '==':
			return evalAst(node.left, ctx) === evalAst(node.right, ctx);
		case '&&': {
			const left = evalAst(node.left, ctx);
			return truthy(left) ? evalAst(node.right, ctx) : left;
		}
		case '||': {
			const left = evalAst(node.left, ctx);
			return truthy(left) ? left : evalAst(node.right, ctx);
		}
		case 'call': {
			if (node.name === 'contains') {
				const hay = evalAst(node.args[0], ctx);
				const needle = evalAst(node.args[1], ctx);
				if (hay == null) return false;
				if (Array.isArray(hay)) return hay.includes(needle);
				return String(hay).includes(String(needle));
			}
			if (node.name === 'fromJSON') {
				return JSON.parse(String(evalAst(node.args[0], ctx)));
			}
			throw new Error(`unknown call ${node.name}`);
		}
		default: {
			const never = node.type;
			throw new Error(`unknown node ${never}`);
		}
	}
}

const ast = parse(tokenize(expression));

function run(github) {
	return truthy(evalAst(ast, { github }));
}

const samples = [
	['owner @claude issue_comment', true, { event_name: 'issue_comment', event: { comment: { body: 'please @claude build this', author_association: 'OWNER' } } }],
	['non-collaborator @claude issue_comment', false, { event_name: 'issue_comment', event: { comment: { body: '@claude do this', author_association: 'CONTRIBUTOR' } } }],
	['owner issue_comment without @claude', false, { event_name: 'issue_comment', event: { comment: { body: 'looks good', author_association: 'OWNER' } } }],
	['none @claude issue_comment', false, { event_name: 'issue_comment', event: { comment: { body: '@claude', author_association: 'NONE' } } }],
	['member @claude pull_request_review_comment', true, { event_name: 'pull_request_review_comment', event: { comment: { body: '@claude look here', author_association: 'MEMBER' } } }],
	['contributor @claude pull_request_review_comment', false, { event_name: 'pull_request_review_comment', event: { comment: { body: '@claude', author_association: 'CONTRIBUTOR' } } }],
	['collaborator @claude pull_request_review', true, { event_name: 'pull_request_review', event: { review: { body: 'ship @claude', author_association: 'COLLABORATOR' } } }],
	['owner pull_request_review without @claude', false, { event_name: 'pull_request_review', event: { review: { body: 'LGTM', author_association: 'OWNER' } } }],
	['owner pull_request_review null body', false, { event_name: 'pull_request_review', event: { review: { body: null, author_association: 'OWNER' } } }],
	['owner issues opened body @claude', true, { event_name: 'issues', event: { action: 'opened', issue: { body: 'Small ticket\n\n@claude', author_association: 'OWNER', title: 'no mention' } } }],
	['contributor issues opened body @claude', false, { event_name: 'issues', event: { action: 'opened', issue: { body: '@claude', author_association: 'CONTRIBUTOR', title: '' } } }],
	['owner issues opened title @claude body empty', false, { event_name: 'issues', event: { action: 'opened', issue: { body: '', author_association: 'OWNER', title: '@claude' } } }],
	['owner issues labeled body @claude', false, { event_name: 'issues', event: { action: 'labeled', issue: { body: '@claude', author_association: 'OWNER', title: '' } } }],
	['contributor @claude pull_request_review', false, { event_name: 'pull_request_review', event: { review: { body: '@claude', author_association: 'CONTRIBUTOR' } } }],
	['owner pull_request_review_comment without @claude', false, { event_name: 'pull_request_review_comment', event: { comment: { body: 'nit', author_association: 'OWNER' } } }],
];

let failed = 0;
for (const [name, expect, github] of samples) {
	const got = run(github);
	const label = got ? 'RUN' : 'SKIP';
	const ok = got === expect;
	if (!ok) failed += 1;
	console.log(`${ok ? 'ok' : 'FAIL'} ${label} ${name}`);
}
if (failed) {
	console.error(`${failed} mismatched`);
	process.exit(1);
}
console.log(`ok ${samples.length}/${samples.length}`);
