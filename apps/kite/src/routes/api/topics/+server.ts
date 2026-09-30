import { GET as proxyGET, POST as proxyPOST } from '$lib/server/proxy';

export const GET = proxyGET('/topics');
export const POST = proxyPOST('/topics');
