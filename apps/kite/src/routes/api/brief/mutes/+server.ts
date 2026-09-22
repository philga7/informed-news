import { GET as proxyGET, POST as proxyPOST } from '$lib/server/proxy';

export const GET = proxyGET('/brief/mutes');
export const POST = proxyPOST('/brief/mutes');

