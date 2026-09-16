import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ComparisonValue } from '@/components/data/ComparisonValue';
import { DataTable } from '@/components/data/DataTable';
import { StatTile } from '@/components/data/StatTile';
import { EmptyState, NoResultsState } from '@/components/data/States';
import { Badge, OrderStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { EMPTY } from '@/lib/format';

/*
|--------------------------------------------------------------------------
| ComparisonValue — the component most able to mislead
|--------------------------------------------------------------------------
*/

describe('ComparisonValue', () => {
  it('colours a rise as favourable when up is good', () => {
    const { container } = render(<ComparisonValue change={0.096} favourable="up" />);

    expect(container.querySelector('.text-\\[--color-positive\\]')).not.toBeNull();
  });

  it('colours a rise as UNFAVOURABLE when down is good', () => {
    // Expenses rising is bad news even though the number grew.
    const { container } = render(<ComparisonValue change={0.41} favourable="down" />);

    expect(container.querySelector('.text-\\[--color-negative\\]')).not.toBeNull();
    expect(container.querySelector('.text-\\[--color-positive\\]')).toBeNull();
  });

  it('colours a fall as favourable when down is good', () => {
    const { container } = render(<ComparisonValue change={-0.05} favourable="down" />);

    expect(container.querySelector('.text-\\[--color-positive\\]')).not.toBeNull();
  });

  it('pairs the colour with an arrow, so colour is never the only signal', () => {
    render(<ComparisonValue change={0.1} favourable="up" />);
    expect(screen.getByText('▲')).toBeInTheDocument();

    render(<ComparisonValue change={-0.1} favourable="up" />);
    expect(screen.getByText('▼')).toBeInTheDocument();
  });

  it('renders an unavailable comparison as an em dash, never as zero', () => {
    render(<ComparisonValue change={null} basis="vs previous 30 days" />);

    expect(screen.getByText(EMPTY)).toBeInTheDocument();
    expect(screen.queryByText(/0\.0%/)).not.toBeInTheDocument();
  });

  it('always states the comparison basis in words', () => {
    render(<ComparisonValue change={0.1} basis="vs previous 30 days" />);

    expect(screen.getByText('vs previous 30 days')).toBeInTheDocument();
  });

  it('labels a ratio difference as pp rather than %', () => {
    render(<ComparisonValue change={-0.042} format="points" />);

    expect(screen.getByText(/-4\.2 pp/)).toBeInTheDocument();
  });
});

/*
|--------------------------------------------------------------------------
| StatTile
|--------------------------------------------------------------------------
*/

describe('StatTile', () => {
  it('renders a value with its label', () => {
    render(<StatTile label="Net revenue" value="BHD 48,210.500" />);

    expect(screen.getByRole('heading', { name: 'Net revenue' })).toBeInTheDocument();
    expect(screen.getByText('BHD 48,210.500')).toBeInTheDocument();
  });

  it('renders a null value as an em dash with a reason, not as zero', () => {
    render(
      <StatTile label="Average order value" value={null} emptyReason="No orders in this period." />,
    );

    const value = screen.getByText(EMPTY);

    expect(value).toBeInTheDocument();
    expect(value).toHaveAttribute('title', 'No orders in this period.');
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('badges a period that is still accumulating', () => {
    render(<StatTile label="Revenue" value="BHD 9,120.250" partial />);

    expect(screen.getByText('Incomplete')).toBeInTheDocument();
  });

  it('exposes the metric definition through an accessible control', () => {
    render(
      <StatTile label="Gross margin" value="38.4%" definition="Gross profit over net revenue." />,
    );

    expect(screen.getByRole('button', { name: 'What is Gross margin?' })).toBeInTheDocument();
  });

  it('marks itself busy while loading', () => {
    const { container } = render(<StatTile label="Revenue" loading />);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});

/*
|--------------------------------------------------------------------------
| DataTable
|--------------------------------------------------------------------------
*/

const COLUMNS = [
  { key: 'reference', header: 'Order', sortable: true },
  { key: 'customer', header: 'Customer' },
  { key: 'total', header: 'Total', sortable: true, numeric: true },
];

const ROWS = [
  { id: 1, reference: 'ORD-001', customer: 'Acme', total: '100.000' },
  { id: 2, reference: 'ORD-002', customer: 'Gulf', total: '250.000' },
];

describe('DataTable', () => {
  it('renders semantic table markup with column headers', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} caption="Orders" />);

    const table = screen.getByRole('table', { name: 'Orders' });

    expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header + 2
  });

  it('right-aligns numeric columns with tabular figures', () => {
    const { container } = render(<DataTable columns={COLUMNS} rows={ROWS} />);

    const totalCell = container.querySelector('tbody tr td:last-child');

    // Logical property, so it survives dir="rtl".
    expect(totalCell.className).toContain('text-end');
    expect(totalCell.className).toContain('tabular');
  });

  it('exposes sort state through aria-sort', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} sort="-reference" onSortChange={() => {}} />);

    const header = screen.getByRole('columnheader', { name: /Order/ });

    expect(header).toHaveAttribute('aria-sort', 'descending');
  });

  it('marks unsorted sortable columns as none', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} sort="-reference" onSortChange={() => {}} />);

    expect(screen.getByRole('columnheader', { name: /Total/ })).toHaveAttribute(
      'aria-sort',
      'none',
    );
  });

  it('sorts ascending first, then flips on the active column', async () => {
    const onSortChange = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <DataTable columns={COLUMNS} rows={ROWS} sort={null} onSortChange={onSortChange} />,
    );

    await user.click(screen.getByRole('button', { name: /Order/ }));
    expect(onSortChange).toHaveBeenCalledWith('reference');

    rerender(
      <DataTable columns={COLUMNS} rows={ROWS} sort="reference" onSortChange={onSortChange} />,
    );

    await user.click(screen.getByRole('button', { name: /Order/ }));
    expect(onSortChange).toHaveBeenLastCalledWith('-reference');
  });

  it('makes sortable headers keyboard operable', async () => {
    const onSortChange = vi.fn();
    const user = userEvent.setup();

    render(<DataTable columns={COLUMNS} rows={ROWS} sort={null} onSortChange={onSortChange} />);

    await user.tab();
    await user.keyboard('{Enter}');

    expect(onSortChange).toHaveBeenCalled();
  });

  /*
   * The four states. A table that renders only the success case is incomplete.
   */

  it('renders a skeleton with the correct column count while loading', () => {
    const { container } = render(<DataTable columns={COLUMNS} rows={[]} loading />);

    // Header placeholder has one block per real column, so nothing jumps.
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThanOrEqual(COLUMNS.length);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders an error state with a retry and the reference id', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        error={{ message: 'Could not reach the server.', reference: 'abc-123' }}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Could not reach the server.')).toBeInTheDocument();
    expect(screen.getByText(/abc-123/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('distinguishes "nothing exists yet" from "filters match nothing"', async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        empty={<EmptyState title="No orders yet" description="Create your first order." />}
      />,
    );

    expect(screen.getByText('No orders yet')).toBeInTheDocument();

    rerender(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        activeFilters={['status: cancelled']}
        onClearFilters={onClear}
      />,
    );

    // Crucially NOT "No orders yet" — that would be false when 4,000 exist.
    expect(screen.queryByText('No orders yet')).not.toBeInTheDocument();
    expect(screen.getByText('No matching records')).toBeInTheDocument();
    expect(screen.getByText('status: cancelled')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalled();
  });
});

/*
|--------------------------------------------------------------------------
| Primitives
|--------------------------------------------------------------------------
*/

describe('Button', () => {
  it('is disabled and marked busy while loading', () => {
    render(<Button loading>Saving</Button>);

    const button = screen.getByRole('button');

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('defaults to type="button" so it cannot submit a form by accident', () => {
    render(<Button>Click</Button>);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('does not fire while loading', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );

    await user.click(screen.getByRole('button'));

    // Double-confirming an order would double-decrement stock.
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Field', () => {
  it('ties the label, control and error together for assistive technology', () => {
    render(
      <Field label="SKU" error="This SKU is already in use." required>
        {(props) => <Input {...props} />}
      </Field>,
    );

    const input = screen.getByLabelText(/SKU/);

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAccessibleDescription('This SKU is already in use.');
  });

  it('describes the field by its hint when there is no error', () => {
    render(
      <Field label="Unit price" hint="Excludes tax">
        {(props) => <Input {...props} />}
      </Field>,
    );

    expect(screen.getByLabelText('Unit price')).toHaveAccessibleDescription('Excludes tax');
  });
});

describe('Badge', () => {
  it('always renders a text label, never a bare colour', () => {
    render(<OrderStatusBadge status="fulfilled" />);

    expect(screen.getByText('Fulfilled')).toBeInTheDocument();
  });

  it('falls back to the raw value for an unknown status rather than rendering nothing', () => {
    render(<OrderStatusBadge status="archived" />);

    expect(screen.getByText('archived')).toBeInTheDocument();
  });

  it('renders every tone', () => {
    for (const tone of ['neutral', 'accent', 'positive', 'negative', 'warning']) {
      const { unmount } = render(<Badge tone={tone}>{tone}</Badge>);
      expect(screen.getByText(tone)).toBeInTheDocument();
      unmount();
    }
  });
});

describe('NoResultsState', () => {
  it('names the active filters so the user can see what excluded their data', () => {
    render(<NoResultsState activeFilters={['status: cancelled', 'August 2026']} />);

    expect(screen.getByText('status: cancelled')).toBeInTheDocument();
    expect(screen.getByText('August 2026')).toBeInTheDocument();
  });
});
