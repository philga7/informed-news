import { DELETE as proxyDELETE, PATCH as proxyPATCH } from '$lib/server/proxy';

export const PATCH = proxyPATCH('/feedback/[id]');
export const DELETE = proxyDELETE('/feedback/[id]');
