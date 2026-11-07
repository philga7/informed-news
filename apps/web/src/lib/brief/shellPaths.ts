/**
 * True for the Brief home, shared brief URLs, and the shell page tree.
 * `/shellish`, `/latestish`, and other non-shell routes stay with Kite.
 */
export function shellOwnsPath(pathname: string): boolean {
	if (pathname === '/' || pathname === '/shell' || pathname.startsWith('/shell/')) return true;
	if (pathname === '/latest' || pathname.startsWith('/latest/')) return true;
	return false;
}
