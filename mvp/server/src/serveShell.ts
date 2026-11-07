import path from 'node:path';

/**
 * True for the Brief home, shared brief URLs, and the shell page tree.
 * `/shellish`, `/latestish`, and other non-shell routes stay with Kite.
 */
export function shellOwnsPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/shell' || pathname.startsWith('/shell/')) return true;
  if (pathname === '/latest' || pathname.startsWith('/latest/')) return true;
  return false;
}

/**
 * Path to the built shell `handler.js` inside `WEB_BUILD_DIR`, or `null` when
 * that env var is unset, empty, or whitespace (the default: `npm run dev` and
 * `createApp()` stay as they are today).
 */
export function shellHandlerPath(env: NodeJS.ProcessEnv): string | null {
  const buildDir = env.WEB_BUILD_DIR?.trim();
  if (!buildDir) return null;
  return path.join(buildDir, 'handler.js');
}
