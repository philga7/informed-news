import { DELETE as proxyDELETE } from '$lib/server/proxy';

export const DELETE = proxyDELETE('/brief/mutes/[id]');

