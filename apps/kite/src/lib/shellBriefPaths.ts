/** True for Brief URLs the served shell owns (`/`, `/latest`, `/latest/…`). */
export function isShellBriefPath(pathname: string): boolean {
	if (pathname === '/' || pathname === '/latest' || pathname.startsWith('/latest/')) {
		return true;
	}
	return false;
}

/**
 * Full-page load only when this process is the image or the hermetic stack
 * (`PUBLIC_SHELL_OWNS_BRIEF=1`). Local `npm run dev` leaves the flag unset,
 * so Kite keeps client-side navigation to `/`.
 */
export function shouldReloadForShell(pathname: string, shellOwnsBrief: boolean): boolean {
	return shellOwnsBrief && isShellBriefPath(pathname);
}
