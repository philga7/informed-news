import path from 'node:path';

/**
 * Path to the built Kite `handler.js` inside `KITE_BUILD_DIR`, or `null` when
 * that env var is unset, empty, or whitespace (the default: `npm run dev` and
 * `createApp()` stay as they are today).
 */
export function kiteHandlerPath(env: NodeJS.ProcessEnv): string | null {
  const buildDir = env.KITE_BUILD_DIR?.trim();
  if (!buildDir) return null;
  return path.join(buildDir, 'handler.js');
}
