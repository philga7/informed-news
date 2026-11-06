import { vi } from 'vitest';

export function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

export type RecordedBriefFetch = {
	url: string;
	method: string;
	body: unknown;
	credentials: RequestCredentials | undefined;
};

type BriefFetchHandler = (call: {
	url: string;
	method: string;
	body: unknown;
	init: RequestInit | undefined;
}) => Response | Promise<Response>;

function requestUrl(input: RequestInfo | URL): string {
	if (typeof input === 'string') return input;
	if (input instanceof URL) return input.toString();
	return input.url;
}

function recordedBody(init: RequestInit | undefined): unknown {
	if (typeof init?.body !== 'string') return undefined;
	return JSON.parse(init.body) as unknown;
}

export function installBriefFetchMock(handler: BriefFetchHandler) {
	const calls: RecordedBriefFetch[] = [];
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = requestUrl(input);
		const method = init?.method ?? 'GET';
		const body = recordedBody(init);
		const credentials = init?.credentials;
		calls.push({ url, method, body, credentials });
		return handler({ url, method, body, init });
	});
	vi.stubGlobal('fetch', fetchMock);
	return {
		calls,
		fetchMock,
		restore() {
			vi.unstubAllGlobals();
		},
	};
}
