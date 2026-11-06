// Mock file for $app/environment in tests.
// Read NODE_ENV without @types/node; the shell tsconfig has no Node types.
const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
	?.NODE_ENV;

export const browser = typeof window !== 'undefined';
export const dev = nodeEnv === 'development';
export const building = false;
export const prerendering = false;
