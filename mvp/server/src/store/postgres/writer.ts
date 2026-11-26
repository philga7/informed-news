import { DashboardStoreError } from './storeSupport.js';

/**
 * Who wrote a row (NEWS-263): an agent, through its token, or a signed-in
 * user. Every store write records one. Rows written before schema v5 have
 * none until the operator claims them for an agent.
 */
export type Writer = { agentId: string } | { userId: string };

/** How a read-back names a writer. Null for a row written before v5 and not claimed. */
export type WriterName = { agent: string } | { user: string } | null;

/** The two writer column values, agent first, for an INSERT or UPDATE. */
export function writerParams(writer: Writer): [string | null, string | null] {
  if ('agentId' in writer && typeof writer.agentId === 'string' && writer.agentId !== '') {
    return [writer.agentId, null];
  }
  if ('userId' in writer && typeof writer.userId === 'string' && writer.userId !== '') {
    return [null, writer.userId];
  }
  throw new DashboardStoreError('a write needs a writer: an agent or a user');
}

export function writerName(agentId: string | null, userId: string | null): WriterName {
  if (agentId !== null) return { agent: agentId };
  if (userId !== null) return { user: userId };
  return null;
}
