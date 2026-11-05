import { GET as proxyGET, POST as proxyPOST } from '$lib/server/proxy';

export const GET = proxyGET('/feedback');
export const POST = proxyPOST('/feedback');
