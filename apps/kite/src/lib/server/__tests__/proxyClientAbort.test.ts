import { describe, expect, it } from 'vitest';
import { isProxyClientAbortError } from '../proxyClientAbort';

describe('isProxyClientAbortError (NEWS-105)', () => {
	it('matches AbortError and aborted / ECONNRESET messages', () => {
		expect(isProxyClientAbortError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(
			true,
		);
		expect(isProxyClientAbortError(new Error('The operation was aborted'))).toBe(true);
		expect(isProxyClientAbortError(new Error('read ECONNRESET'))).toBe(true);
		expect(isProxyClientAbortError({ code: 'ECONNRESET', message: 'socket hang up' })).toBe(true);
		expect(isProxyClientAbortError({ code: 'ECONNABORTED', message: 'timeout' })).toBe(true);
	});

	it('matches undici-style fetch failed with an abort cause', () => {
		const cause = Object.assign(new Error('aborted'), { code: 'ECONNRESET' });
		expect(isProxyClientAbortError(Object.assign(new TypeError('fetch failed'), { cause }))).toBe(
			true,
		);
	});

	it('does not match unrelated failures', () => {
		expect(isProxyClientAbortError(null)).toBe(false);
		expect(isProxyClientAbortError('aborted')).toBe(false);
		expect(isProxyClientAbortError(new Error('upstream 502'))).toBe(false);
		expect(isProxyClientAbortError({ code: 'ENOTFOUND', message: 'getaddrinfo' })).toBe(false);
	});
});
