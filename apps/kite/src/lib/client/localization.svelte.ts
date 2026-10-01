import Mustache from 'mustache';
import { browser } from '$app/environment';
import { page } from '$app/state';
import { language } from '$lib/stores/language.svelte.js';

export function s(key: string, view?: Record<string, string>, strict?: false): string;
export function s(
	key: string,
	view: Record<string, string> | undefined,
	strict: true,
): string | undefined;
export function s(key: string, view?: Record<string, string>, strict = false): string | undefined {
	// Use server-side strings on server, client-side strings on client
	const strings = browser ? language.currentStrings : page.data.strings;
	const entry = strings?.[key];
	const value = typeof entry === 'string' ? entry : entry?.text;

	if (!value) return strict ? undefined : key;

	return view ? Mustache.render(value, view) : value;
}
