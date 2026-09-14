import type { MapsProvider } from '$lib/data/settings.svelte';
import { FEATURES } from '$lib/features';

/**
 * Check if the user is logged into a Kagi account (upstream session).
 * Informed News does not use Kagi account sync by default (NEWS-47).
 */
export function isKagiLoggedIn(): boolean {
	return false;
}

/**
 * Check if user is logged in using provided session
 */
export function isLoggedInWithSession(session: Session | null | undefined): boolean {
	return session?.loggedIn === true;
}

/**
 * Get the appropriate maps URL based on provider setting and location
 */
export function getMapsUrl(
	location: string,
	provider: MapsProvider,
	coordinates?: { lat: number; lon: number },
	session?: Session | null,
): string {
	const cleanLocation = location.trim();
	const encodedLocation = encodeURIComponent(cleanLocation);

	let actualProvider = provider;
	if (provider === 'auto') {
		const isLoggedIn = session ? isLoggedInWithSession(session) : isKagiLoggedIn();
		actualProvider =
			FEATURES.kagiMaps && isLoggedIn ? 'kagi' : 'google';
	}
	if (!FEATURES.kagiMaps && actualProvider === 'kagi') {
		actualProvider = 'google';
	}

	switch (actualProvider) {
		case 'kagi':
			if (coordinates) {
				return `https://kagi.com/maps?q=${coordinates.lat},${coordinates.lon}`;
			}
			return `https://kagi.com/maps?q=${encodedLocation}`;

		case 'google':
			if (coordinates) {
				return `https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lon}`;
			}
			return `https://www.google.com/maps/search/?api=1&query=${encodedLocation}`;

		case 'openstreetmap':
			if (coordinates) {
				return `https://www.openstreetmap.org/?mlat=${coordinates.lat}&mlon=${coordinates.lon}&zoom=12`;
			}
			return `https://www.openstreetmap.org/search?query=${encodedLocation}`;

		case 'apple':
			if (coordinates) {
				return `https://maps.apple.com/?ll=${coordinates.lat},${coordinates.lon}&z=12`;
			}
			return `https://maps.apple.com/?q=${encodedLocation}`;

		default:
			if (coordinates) {
				return `https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lon}`;
			}
			return `https://www.google.com/maps/search/?api=1&query=${encodedLocation}`;
	}
}

/**
 * Get display name for a maps provider
 */
export function getMapsProviderDisplayName(
	provider: MapsProvider,
	session?: Session | null,
): string {
	switch (provider) {
		case 'auto': {
			const isLoggedIn = session ? isLoggedInWithSession(session) : isKagiLoggedIn();
			if (FEATURES.kagiMaps && isLoggedIn) return 'Kagi Maps (auto)';
			return 'Google Maps (auto)';
		}
		case 'kagi':
			return FEATURES.kagiMaps ? 'Kagi Maps' : 'Google Maps';
		case 'google':
			return 'Google Maps';
		case 'openstreetmap':
			return 'OpenStreetMap';
		case 'apple':
			return 'Apple Maps';
		default:
			return 'Maps';
	}
}
