import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ComparisonValue } from '@/components/data/ComparisonValue';
import { DataTable } from '@/components/data/DataTable';
import { StatTile } from '@/components/data/StatTile';
import { EmptyState, NoResultsState } from '@/components/data/States';
import { CatalogPicker } from '@/features/orders/CatalogPicker';
import { grossMargin } from '@/features/catalog/ProductFormDialog';
import { Badge, OrderStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { AccountPreview } from '@/features/auth/AccountPreview';
import { PasswordMeter } from '@/features/auth/PasswordMeter';
import { greeting, initials } from '@/lib/person';
import { EMPTY } from '@/lib/format';

/*
|--------------------------------------------------------------------------
| ComparisonValue — the component most able to mislead
|--------------------------------------------------------------------------
*/

describe('ComparisonValue', () => {
  it('colours a rise as favourable when up is good', () => {
    const { container } = render(<ComparisonValue change={0.096} favourable="up" />);

    expect(container.querySelector('[data-tone="positive"]')).not.toBeNull();
  });

  it('colours a rise as UNFAVOURABLE when down is good', () => {
    // Expenses rising is bad news even though the number grew.
    const { container } = render(<ComparisonValue change={0.41} favourable="down" />);

    expect(container.querySelector('[data-tone="negative"]')).not.toBeNull();
    expect(container.querySelector('[data-tone="positive"]')).toBeNull();
  });

  it('colours a fall as favourable when down is good', () => {
    const { container } = render(<ComparisonValue change={-0.05} favourable="down" />);

    expect(container.querySelector('[data-tone="positive"]')).not.toBeNull();
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

/*
|--------------------------------------------------------------------------
| CatalogPicker — the two ways a dropdown lies
|--------------------------------------------------------------------------
|
| A picker fed by one page of a catalogue can mislead in exactly two ways: it
| can show nothing because the fetch failed, and it can show a hundred records
| while implying that is all of them. Both used to be silent on the new-order
| screen.
|
*/

describe('CatalogPicker', () => {
  const base = {
    label: 'Product',
    searchLabel: 'Search products',
    searchPlaceholder: 'Search name or SKU…',
    placeholder: 'Choose a product',
    options: [
      { value: 1, label: 'WIDGET-1 — Widget' },
      { value: 2, label: 'WIDGET-2 — Widget, larger' },
    ],
    value: '',
    onChange: () => {},
    search: '',
    onSearchChange: () => {},
  };

  it('names a failed fetch instead of rendering an empty list', async () => {
    const onRetry = vi.fn();

    render(
      <CatalogPicker
        {...base}
        options={[]}
        isError
        error={{ code: 'unknown', message: 'The catalogue could not be read.' }}
        onRetry={onRetry}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The catalogue could not be read.');

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('names a fetch that never reached the server by its code, not its message', () => {
    render(
      <CatalogPicker {...base} options={[]} isError error={{ code: 'network.unreachable' }} />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/connection|offline|reach/i);
  });

  it('admits when it is showing only the first page of a longer catalogue', () => {
    render(<CatalogPicker {...base} total={412} />);

    expect(screen.getByText(/Showing the first 2 of 412/)).toBeInTheDocument();
  });

  it('says nothing of the sort when the page IS the whole catalogue', () => {
    render(<CatalogPicker {...base} total={2} hint="Pick one." />);

    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();
    expect(screen.getByText('Pick one.')).toBeInTheDocument();
  });

  it('reports what was typed, so the caller can search the server', async () => {
    const onSearchChange = vi.fn();

    render(<CatalogPicker {...base} onSearchChange={onSearchChange} />);

    await userEvent.type(screen.getByLabelText('Search products'), 'W');
    expect(onSearchChange).toHaveBeenCalledWith('W');
  });

  it('tells a reader whose search matched nothing, rather than showing a bare list', () => {
    render(<CatalogPicker {...base} options={[]} search="ZZZ" total={0} />);

    expect(screen.getByText(/ZZZ/)).toBeInTheDocument();
  });

  it('keeps what was already chosen on the list when a later search would hide it', () => {
    // Searching for something else must not quietly un-choose the record the
    // form is still holding the id of.
    render(
      <CatalogPicker
        {...base}
        options={[{ value: 9, label: 'GADGET-9 - Gadget' }]}
        search="GADGET"
        value="3"
        selected={{ value: 3, label: 'WIDGET-3 - Widget' }}
      />,
    );

    expect(screen.getByRole('option', { name: 'WIDGET-3 - Widget' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Product' })).toHaveValue('3');
  });

  it('does not list the chosen record twice when the search still returns it', () => {
    render(
      <CatalogPicker {...base} value="1" selected={{ value: 1, label: 'WIDGET-1 - Widget' }} />,
    );

    expect(screen.getAllByRole('option', { name: /WIDGET-1/ })).toHaveLength(1);
  });
});

/*
|--------------------------------------------------------------------------
| The product form's margin preview
|--------------------------------------------------------------------------
|
| The only arithmetic in that file, and the only mistake the form can make
| that nothing downstream catches: a price at or below cost books happily,
| and the loss turns up a month later in a figure nobody connects to the
| moment it was typed.
|
*/

describe('grossMargin', () => {
  it('reports the profit and the ratio a price and cost describe', () => {
    const margin = grossMargin('13.6606', '6.9256');

    expect(margin.profit).toBeCloseTo(6.735, 3);
    expect(margin.ratio).toBeCloseTo(0.493, 3);
    expect(margin.atOrBelowCost).toBe(false);
  });

  it('flags a price that sells at a loss, and one that merely breaks even', () => {
    expect(grossMargin('10', '12').atOrBelowCost).toBe(true);
    expect(grossMargin('10', '10').atOrBelowCost).toBe(true);
  });

  it('says nothing at all until both fields have something in them', () => {
    // A blank field is not a zero. Treating it as one would announce a
    // hundred percent margin to someone who has typed a price and no cost.
    expect(grossMargin('', '5')).toBeNull();
    expect(grossMargin('10', '')).toBeNull();
    expect(grossMargin('abc', '5')).toBeNull();
  });

  it('has no margin to report for a product given away', () => {
    // Not minus infinity, which is what dividing by the price would give.
    expect(grossMargin('0', '5')).toBeNull();
  });
});

/*
|--------------------------------------------------------------------------
| The sign-up fields
|--------------------------------------------------------------------------
|
| Two of them make a promise about what the product will do with what was
| typed, which is a promise only worth making if it cannot drift.
|
*/

describe('lib/person', () => {
  it('takes the first letter of the first two words, and no more', () => {
    expect(initials('Ahmed Al Hawajri')).toBe('AA');
    expect(initials('Ahmed')).toBe('A');
  });

  it('gives a mark rather than an empty circle for an empty name', () => {
    // A chip with nothing in it reads as an image that failed to load.
    expect(initials('')).toBe('·');
    expect(initials('   ')).toBe('·');
  });

  it('greets by the first name alone', () => {
    // The rule the sign-up preview exists to make visible: someone who types
    // their full name will be called by the first part of it.
    const t = vi.fn((key, values) => `${key}:${values?.name ?? ''}`);

    expect(greeting(t, 'Ahmed Al Hawajri')).toMatch(/:Ahmed$/);
    expect(greeting(t, '  Ahmed  Al  Hawajri ')).toMatch(/:Ahmed$/);
  });

  it('falls back to a greeting with no name in it', () => {
    const t = vi.fn((key) => key);

    expect(greeting(t, '')).toMatch(/Anonymous$/);
    expect(greeting(t, undefined)).toMatch(/Anonymous$/);
  });
});

describe('AccountPreview', () => {
  it('shows nothing at all until there is something to preview', () => {
    const { container } = render(<AccountPreview businessName="" name="" roleLabel="Owner" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('is hidden from a screen reader, because it only echoes what was just typed', () => {
    // Read aloud it would repeat the reader's own input back at them on every
    // keystroke. The two fields are the accessible interface.
    const { container } = render(
      <AccountPreview
        businessName="Al Hawajri Trading"
        name="Ahmed Al Hawajri"
        roleLabel="Owner"
      />,
    );

    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws the chip with the same rules the top bar uses', () => {
    const { container } = render(
      <AccountPreview
        businessName="Al Hawajri Trading"
        name="Ahmed Al Hawajri"
        roleLabel="Owner"
      />,
    );

    expect(container.textContent).toContain(initials('Ahmed Al Hawajri'));
    expect(container.textContent).toContain('Ahmed Al Hawajri');
    expect(container.textContent).toContain('Al Hawajri Trading');
  });
});

describe('PasswordMeter', () => {
  it('names the breach rule before anyone can fail it', () => {
    /*
     * The server's policy is min(12)->uncompromised(), so a long password
     * that has appeared in a known breach is refused after a round trip.
     * Saying so only in the error would mean the form never mentioned the
     * rule until it had already been broken.
     */
    const { container } = render(<PasswordMeter value="" minimum={12} />);

    expect(container.textContent).toContain('breach');
  });

  it('measures nothing before anything is typed', () => {
    // An empty bar beside an empty field is a progress indicator for a task
    // nobody has started.
    const { container } = render(<PasswordMeter value="" minimum={12} />);

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('reports only length, never a verdict on the password', () => {
    /*
     * Not a strength meter. The server owns validation truth (ADR-012), and
     * a client that scores a password out of four is inventing rules it does
     * not own. The only claim made here is the one already on screen.
     */
    const short = render(<PasswordMeter value="short" minimum={12} />);

    expect(short.container.textContent).not.toMatch(/weak|strong|medium/i);
    expect(short.container.textContent).toContain('At least');

    short.unmount();

    const long = render(<PasswordMeter value="a much longer passphrase" minimum={12} />);

    expect(long.container.textContent).toContain('Long enough');
  });

  it('announces the threshold politely, and the bar not at all', () => {
    const { container } = render(<PasswordMeter value="short" minimum={12} />);

    // The bar is decorative; a live region firing per keystroke is unusable.
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });
});
