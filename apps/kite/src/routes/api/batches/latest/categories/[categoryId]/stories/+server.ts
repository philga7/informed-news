import { GET as proxyGET } from '$lib/server/proxy';

export const GET = proxyGET('/batches/latest/categories/[categoryId]/stories');