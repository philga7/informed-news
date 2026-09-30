import { PRODUCT_NAME } from './brand';

export type TopicKind = 'desired' | 'undesired';

export type TopicLevel = 'core' | 'watch';

export type TopicSection = 'business' | 'technical' | 'action' | 'map' | 'history';

export type Topic = {
	id: string;
	name: string;
	kind: TopicKind;
	level: TopicLevel | null;
	description: string;
	keywords: string[];
	searchQuery: string;
	sections: TopicSection[];
	notes: string;
	createdAt: string;
	updatedAt: string;
};

export type TopicPayload = Pick<
	Topic,
	'name' | 'kind' | 'level' | 'description' | 'keywords' | 'searchQuery' | 'sections' | 'notes'
>;

export const TOPIC_SECTIONS: ReadonlyArray<{ id: TopicSection; label: string }> = [
	{ id: 'business', label: 'Business angle' },
	{ id: 'technical', label: 'Technical details' },
	{ id: 'action', label: 'What you can do' },
	{ id: 'map', label: 'Map' },
	{ id: 'history', label: 'History' },
];

export const TOPICS_PAGE_TITLE = `Topics — ${PRODUCT_NAME}`;

export const TOPICS_PAGE_DESCRIPTION = `Your ${PRODUCT_NAME} topic list drives what the Brief searches for and what it filters out.`;

export const TOPICS_LOGIN_INTRO =
	'Topics are currently limited to the MVP operator session. Enter the same password used for the local API to manage topics.';

export const TOPICS_INTRO_HELP =
	'Desired topics drive what the Brief looks for. Core topics get top stories every refresh; Watch topics surface only significant developments. Undesired topics and mute rules filter stories out — mutes always win.';

export const TOPICS_CORE_TITLE = 'Core';

export const TOPICS_WATCH_TITLE = 'Watch';

export const TOPICS_UNDESIRED_TITLE = 'Undesired';

export const TOPICS_MUTES_TITLE = 'Keyword & outlet mutes';

export const TOPICS_MUTES_HELP =
	'Stories matching a keyword (optionally only from one outlet) are always filtered out, even when they match a desired topic.';

export const TOPICS_EMPTY_DESIRED = 'No topics at this level yet.';

export const TOPICS_EMPTY_UNDESIRED = 'No undesired topics yet.';

export const TOPICS_ADD_TITLE = 'Add topic';

export const TOPICS_ADD_LABEL = 'Add topic';

export const TOPICS_SAVE_LABEL = 'Save';

export const TOPICS_CANCEL_LABEL = 'Cancel';

export const TOPICS_EDIT_LABEL = 'Edit';

export const TOPICS_REMOVE_LABEL = 'Remove';

export const TOPICS_MOVE_TO_CORE_LABEL = 'Move to Core';

export const TOPICS_MOVE_TO_WATCH_LABEL = 'Move to Watch';

export const TOPICS_PENDING_LABEL = 'Saving…';

export const TOPICS_FIELD_KIND = 'Type';

export const TOPICS_KIND_DESIRED = 'Desired';

export const TOPICS_KIND_UNDESIRED = 'Undesired';

export const TOPICS_FIELD_LEVEL = 'Level';

export const TOPICS_FIELD_NAME = 'Name';

export const TOPICS_FIELD_DESCRIPTION = 'Description';

export const TOPICS_FIELD_KEYWORDS = 'Keywords (comma or newline separated)';

export const TOPICS_FIELD_QUERY = 'Search query';

export const TOPICS_FIELD_NOTES = 'Notes (traps / exclusions)';

export const TOPICS_FIELD_SECTIONS = 'Extra full-story sections';

export const TOPICS_REMOVE_CONFIRM_TEMPLATE = 'Remove topic "{name}"?';

export const TOPICS_LOAD_ERROR = 'Could not load topics. Try again.';

export const TOPICS_SAVE_ERROR = 'Could not save topic. Try again.';

export const TOPICS_REMOVE_ERROR = 'Could not remove topic. Try again.';

export const TOPICS_NETWORK_ERROR =
	'Network error while talking to the topics API. Check that the server is running on :3001.';

export type TopicFormState = {
	name: string;
	kind: TopicKind;
	level: TopicLevel;
	description: string;
	keywordsText: string;
	searchQuery: string;
	sections: TopicSection[];
	notes: string;
};

export function parseKeywordsInput(text: string): string[] {
	const seen = new Set<string>();
	const keywords: string[] = [];
	for (const part of text.split(/[,\r\n]+/)) {
		const keyword = part.trim();
		if (!keyword) continue;
		const key = keyword.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		keywords.push(keyword);
	}
	return keywords;
}

export function formatKeywordsInput(keywords: readonly string[]): string {
	return keywords.join(', ');
}

function byName(a: Topic, b: Topic): number {
	return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

export function groupTopics(topics: readonly Topic[]): {
	core: Topic[];
	watch: Topic[];
	undesired: Topic[];
} {
	const core: Topic[] = [];
	const watch: Topic[] = [];
	const undesired: Topic[] = [];
	for (const topic of topics) {
		if (topic.kind === 'undesired') undesired.push(topic);
		else if (topic.level === 'core') core.push(topic);
		else watch.push(topic);
	}
	return { core: core.sort(byName), watch: watch.sort(byName), undesired: undesired.sort(byName) };
}

export function emptyTopicForm(kind: TopicKind = 'desired'): TopicFormState {
	return {
		name: '',
		kind,
		level: 'watch',
		description: '',
		keywordsText: '',
		searchQuery: '',
		sections: [],
		notes: '',
	};
}

export function topicToForm(topic: Topic): TopicFormState {
	return {
		name: topic.name,
		kind: topic.kind,
		level: topic.level ?? 'watch',
		description: topic.description,
		keywordsText: formatKeywordsInput(topic.keywords),
		searchQuery: topic.searchQuery,
		sections: [...topic.sections],
		notes: topic.notes,
	};
}

export function formToPayload(form: TopicFormState): TopicPayload {
	const undesired = form.kind === 'undesired';
	return {
		name: form.name.trim(),
		kind: form.kind,
		level: undesired ? null : form.level,
		description: form.description.trim(),
		keywords: parseKeywordsInput(form.keywordsText),
		searchQuery: form.searchQuery.trim(),
		sections: undesired
			? []
			: TOPIC_SECTIONS.map((s) => s.id).filter((id) => form.sections.includes(id)),
		notes: form.notes.trim(),
	};
}

export function removeConfirmMessage(name: string): string {
	return TOPICS_REMOVE_CONFIRM_TEMPLATE.replace('{name}', () => name);
}
