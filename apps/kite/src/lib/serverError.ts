/** Server `error` text is user-facing only for 400 (validation) and 409 (conflict); else `fallback`. */
export function shownServerError(status: number, error: unknown, fallback: string): string {
	if ((status === 400 || status === 409) && typeof error === 'string' && error.trim()) {
		return error.trim();
	}
	return fallback;
}
