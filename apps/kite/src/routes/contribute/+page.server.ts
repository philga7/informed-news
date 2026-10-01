import type { ContributionItem } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	return {
		hasSeenOnboarding: cookies.get('kite-contribute-seen') === '1',
		githubMode: 'manual' as 'auto' | 'manual',
		contributions: [] as ContributionItem[],
	};
};
