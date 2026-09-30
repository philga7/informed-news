import { describe, expect, it } from 'vitest';
import {
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
	it('splits on commas and newlines, trims, drops blanks', () => {
		expect(parseKeywordsInput(' tariffs, trade war\n\n  steel ,, \n')).toEqual([
			'tariffs',
			'trade war',
			'steel',
		]);
	});

	it('dedupes case-insensitively keeping first spelling and order', () => {
		expect(parseKeywordsInput('NATO, nato\nUkraine,ukraine, EU')).toEqual([
			'NATO',
			'Ukraine',
			'EU',
		]);
	});

	it('returns empty for blank input', () => {
		expect(parseKeywordsInput('  ,\n , ')).toEqual([]);
	});
});

describe('formatKeywordsInput', () => {
	it('joins with comma and space', () => {
		expect(formatKeywordsInput(['a', 'b c'])).toBe('a, b c');
		expect(formatKeywordsInput([])).toBe('');
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
				keywordsText: 'F-250, f-250\nF-350',
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
			name: 'Celebrity gossip',
			level: 'core',
			searchQuery: 'celebrity news',
			sections: ['business', 'technical'],
		});
		expect(payload.kind).toBe('undesired');
		expect(payload.level).toBeNull();
		expect(payload.searchQuery).toBe('');
		expect(payload.sections).toEqual([]);
	});
});

describe('topicToForm', () => {
	it('round-trips through formToPayload preserving writable fields', () => {
		const topic = makeTopic({
			name: 'Semiconductors',
			level: 'core',
			description: 'Chip supply chain',
			keywords: ['TSMC', 'Nvidia', 'export controls'],
			searchQuery: 'semiconductor export controls',
			sections: ['business', 'technical'],
			notes: 'Ignore stock tips',
		});
		expect(formToPayload(topicToForm(topic))).toEqual({
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
