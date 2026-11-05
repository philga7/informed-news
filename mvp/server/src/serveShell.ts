import path from 'node:path';

/**
 * True for the shell page and anything under it. `/shellish` and the Brief
 * home page stay with Kite.
 */
export function shellOwnsPath(pathname: string): boolean {
  return pathname === '/shell' || pathname.startsWith('/shell/');
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
