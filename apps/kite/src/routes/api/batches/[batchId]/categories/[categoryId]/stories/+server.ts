import { GET as proxyGET } from '$lib/server/proxy';

export const GET = proxyGET('/batches/[batchId]/categories/[categoryId]/stories');