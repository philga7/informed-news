import { parseArgs } from 'node:util';
import type { Pool } from 'pg';
import { generateAgentToken, hashAgentToken } from '../ingest/agentToken.js';
import {
  WRITTEN_TABLES,
  addAgent,
  claimForAgent,
  disableAgent,
  type ClaimCounts,
  findAgentByName,
  listAgents,
  setAgentTokenHash,
} from '../store/postgres/agentStore.js';

/**
 * Operator commands for agents (NEWS-263), the programs that post through
 * the ingest contract (docs/INGEST.md):
 *
 *   add --name <name> [--claim-unattributed]
 *   list
 *   disable --name <name>
 *   rotate --name <name>
 *   claim --name <name>
 *
 * add and rotate print the token once. The site keeps only its hash.
 */

export type AgentsCliIo = {
  out: (line: string) => void;
  err: (line: string) => void;
  /** Defaults to a new random token; tests pass a fixed one. */
  generateToken?: () => string;
};

export const AGENTS_USAGE = [
  'Usage: npm run agents --prefix mvp/server -- <command>',
  '  add --name <name> [--claim-unattributed]',
  '  list',
  '  disable --name <name>',
  '  rotate --name <name>',
  '  claim --name <name>',
  'add and rotate print the agent\'s token once; the site keeps only its hash.',
  '--claim-unattributed gives the new agent every row written before agents existed;',
  'claim does the same for an agent that already exists.',
  'disable is final for now: there is no enable, and rotate does not re-enable.',
].join('\n');

class UsageError extends Error {}

function printClaim(io: AgentsCliIo, name: string, claimed: ClaimCounts): void {
  const total = WRITTEN_TABLES.reduce((sum, table) => sum + claimed[table], 0);
  io.out(`Claimed ${total} unattributed rows for ${name}:`);
  for (const table of WRITTEN_TABLES) io.out(`  ${table}\t${claimed[table]}`);
}

function required(value: string | undefined, flag: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) throw new UsageError(`${flag} is required`);
  return trimmed;
}

/** Runs one command. Returns the process exit code. */
export async function runAgentsCli(argv: string[], pool: Pool, io: AgentsCliIo): Promise<number> {
  const generate = io.generateToken ?? generateAgentToken;
  try {
    const [command, ...rest] = argv;
    const { values } = parseArgs({
      args: rest,
      options: {
        name: { type: 'string' },
        'claim-unattributed': { type: 'boolean', default: false },
      },
      strict: true,
    });
    if (command !== 'add' && values['claim-unattributed'] === true) {
      throw new UsageError('--claim-unattributed goes with add only');
    }
    switch (command) {
      case 'add': {
        const name = required(values.name, '--name');
        const token = generate();
        const { agent, claimed } = await addAgent(pool, {
          name,
          tokenHash: hashAgentToken(token),
          claimUnattributed: values['claim-unattributed'] === true,
        });
        io.out(`Added agent ${agent.name}, id ${agent.id}`);
        io.out(`Token (shown once): ${token}`);
        if (claimed !== null) printClaim(io, agent.name, claimed);
        return 0;
      }
      case 'list': {
        const agents = await listAgents(pool);
        if (agents.length === 0) io.out('No agents.');
        for (const agent of agents) {
          io.out(`${agent.id}\t${agent.name}\t${agent.enabled ? 'enabled' : 'disabled'}\tcreated ${agent.createdAt}`);
        }
        return 0;
      }
      case 'disable': {
        const name = required(values.name, '--name');
        const agent = await findAgentByName(pool, name);
        if (!agent) {
          io.err(`No agent named ${name}`);
          return 1;
        }
        await disableAgent(pool, agent.id);
        io.out(`Disabled agent ${agent.name}: its token no longer works`);
        return 0;
      }
      case 'rotate': {
        const name = required(values.name, '--name');
        const agent = await findAgentByName(pool, name);
        if (!agent) {
          io.err(`No agent named ${name}`);
          return 1;
        }
        const token = generate();
        await setAgentTokenHash(pool, agent.id, hashAgentToken(token));
        io.out(`New token for ${agent.name}; the old one no longer works`);
        if (!agent.enabled) io.out(`${agent.name} is disabled: the new token will not work either`);
        io.out(`Token (shown once): ${token}`);
        return 0;
      }
      case 'claim': {
        const name = required(values.name, '--name');
        const agent = await findAgentByName(pool, name);
        if (!agent) {
          io.err(`No agent named ${name}`);
          return 1;
        }
        printClaim(io, agent.name, await claimForAgent(pool, agent.id));
        return 0;
      }
      default:
        throw new UsageError(command ? `unknown command ${command}` : 'a command is required');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.err(message);
    if (error instanceof UsageError || (error as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')) {
      io.err(AGENTS_USAGE);
      return 2;
    }
    return 1;
  }
}
