import { describe, expect, it } from 'vitest';
import { toastLiveRegion } from '../toastA11y';

describe('toastLiveRegion (NEWS-145)', () => {
	it('announces info and success politely', () => {
		expect(toastLiveRegion('info')).toEqual({ role: 'status', 'aria-live': 'polite' });
		expect(toastLiveRegion('success')).toEqual({ role: 'status', 'aria-live': 'polite' });
	});

	it('keeps warning and error assertive', () => {
		expect(toastLiveRegion('warning')).toEqual({ role: 'alert', 'aria-live': 'assertive' });
		expect(toastLiveRegion('error')).toEqual({ role: 'alert', 'aria-live': 'assertive' });
	});
});
