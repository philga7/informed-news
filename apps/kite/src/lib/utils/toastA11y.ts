import type { ToastType } from '$lib/stores/toast.svelte';

/** Assertive for warning/error; polite for info/success (NEWS-145). */
export function toastLiveRegion(type: ToastType): {
	role: 'alert' | 'status';
	'aria-live': 'assertive' | 'polite';
} {
	if (type === 'warning' || type === 'error') {
		return { role: 'alert', 'aria-live': 'assertive' };
	}
	return { role: 'status', 'aria-live': 'polite' };
}
