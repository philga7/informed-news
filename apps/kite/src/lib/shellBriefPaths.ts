/** True when Kite must yield a full document load to the shell Brief. */
export function isShellBriefPath(pathname: string): boolean {
	if (pathname === '/' || pathname === '/latest' || pathname.startsWith('/latest/')) {
		return true;
	}
	return false;
}
