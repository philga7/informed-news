import { DELETE as proxyDELETE, PATCH as proxyPATCH } from '$lib/server/proxy';

export const PATCH = proxyPATCH('/topics/[id]');
export const DELETE = proxyDELETE('/topics/[id]');
