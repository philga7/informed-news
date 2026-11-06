import { render, screen } from '@testing-library/svelte';
import { expect, it } from 'vitest';
import HarnessSample from './HarnessSample.svelte';

it('renders the shell unit harness text', () => {
	render(HarnessSample);
	expect(screen.getByText('Shell unit harness')).toBeInTheDocument();
});
