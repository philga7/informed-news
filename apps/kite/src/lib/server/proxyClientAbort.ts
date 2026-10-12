/**
 * Client navigations often abort in-flight proxy fetches (ECONNRESET / AbortError).
 * Those are not server faults — keep them out of Proxy error logs (NEWS-105).
 */
export function isProxyClientAbortError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const err = error as {
		name?: string;
		message?: string;
		code?: string;
		cause?: unknown;
	};
	if (err.name === 'AbortError') return true;
	const code = typeof err.code === 'string' ? err.code.toUpperCase() : '';
	if (code === 'ECONNRESET' || code === 'ECONNABORTED') return true;
	const msg = String(err.message ?? '').toLowerCase();
	if (msg.includes('aborted') || msg.includes('econnreset')) return true;
	if (err.cause !== undefined) return isProxyClientAbortError(err.cause);
	return false;
}
