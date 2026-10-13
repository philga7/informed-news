const EMPTY: ReadonlyMap<string, string[]> = new Map();

/**
 * Topic Brief open-card keyword-filter decisions by story key (NEWS-150). Kept outside
 * TopicBrief so a Brief reload's remount keeps them; changed filter settings start fresh.
 * Not reactive: TopicBrief reads it while deciding and commits the result from an effect.
 */
class OpenFilterCarryStore {
	private settingsKey = '';
	private carry: ReadonlyMap<string, string[]> = EMPTY;

	/** The carry committed under these filter settings; empty if settings changed since. */
	get(settingsKey: string): ReadonlyMap<string, string[]> {
		return settingsKey === this.settingsKey ? this.carry : EMPTY;
	}

	set(settingsKey: string, carry: ReadonlyMap<string, string[]>): void {
		this.settingsKey = settingsKey;
		this.carry = carry;
	}

	clear(): void {
		this.settingsKey = '';
		this.carry = EMPTY;
	}
}

export const openFilterCarry = new OpenFilterCarryStore();
