import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BreakdownChart } from '@/components/charts/BreakdownChart';

/*
 * The ranking on the analytics screen, as a leaderboard.
 *
 * It replaced a bar chart whose "Other" bar set the scale and squeezed the
 * ten ranked rows into a third of the width. These tests hold the fixes.
 */

const ROWS = [
  { key: '1', label: 'لابتوب ١٥ إنش Core i7 32GB', value: '17653.200', share: 0.112 },
  { key: '2', label: 'Meeting table', value: '8826.600', share: 0.056 },
  { key: 'other', label: 'Other', value: '58000.000', share: 0.37, is_other: true },
];

function bars(container) {
  return [...container.querySelectorAll('ol li .rounded-full > span')].map((bar) => bar.style.width);
}

describe('the ranking', () => {
  it('measures every bar against the leader, never against "Other"', () => {
    const { container } = render(<BreakdownChart title="Net revenue by product" rows={ROWS} currency="BHD" />);

    // The leader fills the track; the second, half its revenue, half of it.
    expect(bars(container)).toEqual(['100%', '50%']);
  });

  it('shows "Other" as a summary line, not as a competitor', () => {
    render(<BreakdownChart title="Net revenue by product" rows={ROWS} currency="BHD" />);

    const ranking = screen.getByRole('list');

    expect(within(ranking).queryByText('Other')).not.toBeInTheDocument();
    // On screen under the ranking (the frame's screen-reader table holds it too).
    expect(screen.getAllByText('Other').some((el) => !ranking.contains(el))).toBe(true);
  });

  it('gives every row its amount and its share as text', () => {
    render(<BreakdownChart title="Net revenue by product" rows={ROWS} currency="BHD" />);

    const first = screen.getAllByRole('listitem')[0];

    expect(first).toHaveTextContent('17,653.200');
    expect(first).toHaveTextContent('11.2%');
  });

  it('keeps a mixed Arabic and Latin name in the order it was typed', () => {
    render(<BreakdownChart title="Net revenue by product" rows={ROWS} currency="BHD" />);

    const name = screen.getByTitle('لابتوب ١٥ إنش Core i7 32GB');

    expect(name.style.unicodeBidi).toBe('plaintext');
  });

  it('says how much of the whole the top rows make up', () => {
    render(<BreakdownChart title="Net revenue by product" rows={ROWS} currency="BHD" />);

    expect(screen.getByText(/The top 2 make up 16.8% of the total/)).toBeInTheDocument();
  });
});
