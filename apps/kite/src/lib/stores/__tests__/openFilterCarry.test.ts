import { beforeEach, describe, expect, it } from 'vitest';
import { openFilterCarry } from '../openFilterCarry';

describe('openFilterCarry (NEWS-151)', () => {
	beforeEach(() => openFilterCarry.clear());

	it('starts empty', () => {
		expect(openFilterCarry.get('blur|all|battery').size).toBe(0);
	});

	it('returns the carry set for the same filter settings', () => {
		openFilterCarry.set('blur|all|battery', new Map([['story-a', ['battery']]]));

		expect([...openFilterCarry.get('blur|all|battery')]).toEqual([['story-a', ['battery']]]);
	});

	it('reads empty under changed filter settings, and the next set replaces the old carry', () => {
		openFilterCarry.set('blur|all|battery', new Map([['story-a', ['battery']]]));

		expect(openFilterCarry.get('hide|all|battery').size).toBe(0);

		openFilterCarry.set('hide|all|battery', new Map([['story-b', []]]));
		expect(openFilterCarry.get('blur|all|battery').size).toBe(0);
		expect([...openFilterCarry.get('hide|all|battery')]).toEqual([['story-b', []]]);
	});

	it('clear drops the carry', () => {
		openFilterCarry.set('blur|all|battery', new Map([['story-a', ['battery']]]));
		openFilterCarry.clear();

		expect(openFilterCarry.get('blur|all|battery').size).toBe(0);
	});
});
