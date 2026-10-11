import { describe, expect, it } from 'vitest';
import {
	MUTES_ADD_LABEL,
	MUTES_DELETE_ERROR,
	MUTES_DELETE_LABEL,
	MUTES_EMPTY_COPY,
	MUTES_KEYWORD_LABEL,
	MUTES_KEYWORD_PLACEHOLDER,
	MUTES_LOAD_ERROR,
	MUTES_SAVE_ERROR,
	MUTES_SOURCE_LABEL,
	MUTES_SOURCE_PLACEHOLDER,
	emptyTopicForm,
	formToPayload,
	formatKeywordsInput,
	groupTopics,
	parseKeywordsInput,
	removeConfirmMessage,
	topicToForm,
	type Topic,
} from '$lib/topics';

function makeTopic(overrides: Partial<Topic> = {}): Topic {
	return {
		id: 't1',
		name: 'Topic',
		kind: 'desired',
		level: 'watch',
		description: '',
		keywords: [],
		searchQuery: '',
		sections: [],
		notes: '',
		createdAt: '2026-09-01T00:00:00.000Z',
		updatedAt: '2026-09-01T00:00:00.000Z',
		...overrides,
	};
}

describe('parseKeywordsInput', () => {
	it('splits on newlines, trims, drops blanks, keeps commas inside a keyword', () => {
		expect(parseKeywordsInput(' tariffs\ntrade war\n\n  steel \nSmith, John\n')).toEqual([
			'tariffs',
			'trade war',
			'steel',
			'Smith, John',
		]);
	});

	it('does not split on commas alone', () => {
		expect(parseKeywordsInput('NATO, Ukraine, EU')).toEqual(['NATO, Ukraine, EU']);
	});

	it('dedupes case-insensitively keeping first spelling and order', () => {
		expect(parseKeywordsInput('NATO\nnato\nUkraine\nukraine\nEU')).toEqual([
			'NATO',
			'Ukraine',
			'EU',
		]);
	});

	it('returns empty for blank input', () => {
		expect(parseKeywordsInput('  \n \n ')).toEqual([]);
	});
});

describe('formatKeywordsInput', () => {
	it('joins with newlines', () => {
		expect(formatKeywordsInput(['a', 'b c'])).toBe('a\nb c');
		expect(formatKeywordsInput([])).toBe('');
		expect(formatKeywordsInput(['Smith, John', 'NATO'])).toBe('Smith, John\nNATO');
	});
});

describe('groupTopics', () => {
	it('groups by kind/level and sorts by name case-insensitively without mutating input', () => {
		const topics: Topic[] = [
			makeTopic({ id: '1', name: 'zeta', level: 'core' }),
			makeTopic({ id: '2', name: 'Alpha', level: 'core' }),
			makeTopic({ id: '3', name: 'beta', level: 'watch' }),
			makeTopic({ id: '4', name: 'Crypto', kind: 'undesired', level: null }),
			makeTopic({ id: '5', name: 'Aardvark', level: 'watch' }),
			makeTopic({ id: '6', name: 'celebrity', kind: 'undesired', level: null }),
		];
		const snapshot = topics.map((t) => t.id);

		const grouped = groupTopics(topics);

		expect(grouped.core.map((t) => t.name)).toEqual(['Alpha', 'zeta']);
		expect(grouped.watch.map((t) => t.name)).toEqual(['Aardvark', 'beta']);
		expect(grouped.undesired.map((t) => t.name)).toEqual(['celebrity', 'Crypto']);
		expect(topics.map((t) => t.id)).toEqual(snapshot);
	});

	it('puts desired topics without a level into Watch', () => {
		const grouped = groupTopics([
			makeTopic({ id: '1', name: 'No level', kind: 'desired', level: null }),
			makeTopic({ id: '2', name: 'Core', level: 'core' }),
		]);
		expect(grouped.core.map((t) => t.id)).toEqual(['2']);
		expect(grouped.watch.map((t) => t.id)).toEqual(['1']);
	});

	it('returns empty groups for no topics', () => {
		expect(groupTopics([])).toEqual({ core: [], watch: [], undesired: [] });
	});
});

describe('emptyTopicForm', () => {
	it('defaults to desired + watch with empty fields', () => {
		expect(emptyTopicForm()).toEqual({
			name: '',
			kind: 'desired',
			level: 'watch',
			description: '',
			keywordsText: '',
			searchQuery: '',
			sections: [],
			notes: '',
		});
		expect(emptyTopicForm('undesired').kind).toBe('undesired');
		expect(emptyTopicForm('undesired').level).toBe('watch');
	});
});

describe('formToPayload', () => {
	it('keeps level and canonicalizes sections for desired topics', () => {
		expect(
			formToPayload({
				name: '  Ford Super Duty ',
				kind: 'desired',
				level: 'core',
				description: ' Trucks ',
				keywordsText: 'F-250\nf-250\nF-350',
				searchQuery: ' "Super Duty" ',
				sections: ['history', 'business', 'map', 'business'],
				notes: ' skip ads ',
			}),
		).toEqual({
			name: 'Ford Super Duty',
			kind: 'desired',
			level: 'core',
			description: 'Trucks',
			keywords: ['F-250', 'F-350'],
			searchQuery: '"Super Duty"',
			sections: ['business', 'map', 'history'],
			notes: 'skip ads',
		});
	});

	it('forces level null, no sections, and empty search query for undesired topics', () => {
		const payload = formToPayload({
			...emptyTopicForm('undesired'),
			name: '  Celebrity gossip  ',
			level: 'core',
			keywordsText: '  celeb  \n\n gossip, column  ',
			searchQuery: 'celebrity news',
			sections: ['business', 'technical'],
			notes: '  skip  ',
		});
		expect(payload).toEqual({
			name: 'Celebrity gossip',
			kind: 'undesired',
			level: null,
			description: '',
			keywords: ['celeb', 'gossip, column'],
			searchQuery: '',
			sections: [],
			notes: 'skip',
		});
	});
});

describe('topicToForm', () => {
	it('round-trips through formToPayload preserving writable fields including comma keywords', () => {
		const topic = makeTopic({
			name: 'Semiconductors',
			level: 'core',
			description: 'Chip supply chain',
			keywords: ['TSMC', 'Smith, John', 'export controls'],
			searchQuery: 'semiconductor export controls',
			sections: ['business', 'technical'],
			notes: 'Ignore stock tips',
		});
		const form = topicToForm(topic);
		expect(form.keywordsText).toBe('TSMC\nSmith, John\nexport controls');
		expect(formToPayload(form)).toEqual({
			name: topic.name,
			kind: topic.kind,
			level: topic.level,
			description: topic.description,
			keywords: topic.keywords,
			searchQuery: topic.searchQuery,
			sections: topic.sections,
			notes: topic.notes,
		});
	});

	it('falls back to watch level for undesired topics', () => {
		const form = topicToForm(makeTopic({ kind: 'undesired', level: null }));
		expect(form.level).toBe('watch');
		expect(form.kind).toBe('undesired');
	});
});

describe('removeConfirmMessage', () => {
	it('fills the template with the topic name', () => {
		expect(removeConfirmMessage('Ford Super Duty')).toBe('Remove topic "Ford Super Duty"?');
		expect(removeConfirmMessage('A$&B')).toBe('Remove topic "A$&B"?');
	});
});

describe('mute-rule copy (NEWS-91)', () => {
	it('keeps the original string values', () => {
		expect({
			MUTES_KEYWORD_LABEL,
			MUTES_SOURCE_LABEL,
			MUTES_KEYWORD_PLACEHOLDER,
			MUTES_SOURCE_PLACEHOLDER,
			MUTES_ADD_LABEL,
			MUTES_DELETE_LABEL,
			MUTES_EMPTY_COPY,
			MUTES_LOAD_ERROR,
			MUTES_SAVE_ERROR,
			MUTES_DELETE_ERROR,
		}).toEqual({
			MUTES_KEYWORD_LABEL: 'Keyword',
			MUTES_SOURCE_LABEL: 'Source (optional)',
			MUTES_KEYWORD_PLACEHOLDER: 'keyword',
			MUTES_SOURCE_PLACEHOLDER: 'domain or source',
			MUTES_ADD_LABEL: 'Mute',
			MUTES_DELETE_LABEL: 'Delete',
			MUTES_EMPTY_COPY: 'No mute rules yet.',
			MUTES_LOAD_ERROR: 'Could not load mute rules. Try again.',
			MUTES_SAVE_ERROR: 'Could not save mute rule. Try again.',
			MUTES_DELETE_ERROR: 'Could not delete mute rule. Try again.',
		});
	});
});
