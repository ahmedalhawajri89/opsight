import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InsightFeed } from '@/features/insights/InsightFeed';

/*
 * The insights feed.
 *
 * The rules themselves are tested server-side against real data; what matters
 * here is the reading of them — that a severity is never conveyed by colour
 * alone, that a claim carries its evidence, and above all that an empty feed
 * says WHY it is empty.
 */

function insight(overrides = {}) {
  return {
    id: 'revenue_drop',
    severity: 'warning',
    title: 'Net revenue is down',
    message: 'Net revenue fell 22.4% against the previous 31 days.',
    link: { preset: 'custom', from: '2026-07-01', to: '2026-07-31' },
    values: {},
    ...overrides,
  };
}

describe('a finding', () => {
  it('states the change in words, not only as a figure', () => {
    render(<InsightFeed insights={[insight()]} />);

    expect(screen.getByText('Net revenue is down')).toBeInTheDocument();
    expect(screen.getByText(/fell 22.4%/)).toBeInTheDocument();
  });

  it('labels its severity in text, never by colour alone', () => {
    // A bare coloured badge is lost to a colour-blind reader, a greyscale
    // print and a screenshot in a report (UI_UX_DIRECTION.md §6).
    render(<InsightFeed insights={[insight({ severity: 'action' })]} />);

    expect(screen.getByText('Action')).toBeInTheDocument();
  });

  it('carries the insight period into the link, not today', () => {
    /*
     * A "check the figures" link that lands on a different period shows
     * different numbers from the sentence that sent the reader there, which is
     * worse than offering no link at all.
     */
    render(<InsightFeed insights={[insight()]} />);

    const link = screen.getByRole('link', { name: /check the figures/i });

    expect(link.getAttribute('href')).toContain('from=2026-07-01');
    expect(link.getAttribute('href')).toContain('to=2026-07-31');
  });

  it('sends a point-in-time finding to its operational screen', () => {
    render(
      <InsightFeed
        insights={[
          insight({
            id: 'low_stock',
            severity: 'action',
            link: { href: '/inventory', low_stock: true },
          }),
        ]}
      />,
    );

    // Named for where it goes: a reader should know before following it.
    expect(screen.getByRole('link', { name: /check inventory/i }).getAttribute('href')).toBe(
      '/inventory?low_stock=true',
    );
  });

  it('renders a finding with no link at all without breaking', () => {
    render(<InsightFeed insights={[insight({ link: {} })]} />);

    expect(screen.getByText('Net revenue is down')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('an empty feed', () => {
  /*
   * The distinction this whole component exists to preserve. "Nothing is
   * wrong" and "the rules were not allowed to run" are different statements,
   * and blank space asserts the first.
   */
  it('says nothing crossed a threshold when nothing was suppressed', () => {
    render(<InsightFeed insights={[]} suppressed={{ reason: null, message: null }} />);

    expect(screen.getByText(/crossed a reporting threshold/i)).toBeInTheDocument();
  });

  it('explains a partial period instead of showing blank space', () => {
    render(
      <InsightFeed
        insights={[]}
        suppressed={{
          reason: 'partial_period',
          message: 'This period is still in progress, so trend insights are held back.',
        }}
      />,
    );

    expect(screen.getByText(/held back until this period finishes/i)).toBeInTheDocument();
    expect(screen.getByText(/still in progress/i)).toBeInTheDocument();
    expect(screen.queryByText(/crossed a reporting threshold/i)).not.toBeInTheDocument();
  });

  it('explains a thin period in the same way', () => {
    render(
      <InsightFeed
        insights={[]}
        suppressed={{
          reason: 'too_few_orders',
          message: 'Fewer than 10 orders in this period, so percentage insights are held back.',
        }}
      />,
    );

    expect(screen.getByText(/held back on this period/i)).toBeInTheDocument();
    expect(screen.getByText(/Fewer than 10 orders/)).toBeInTheDocument();
  });
});
