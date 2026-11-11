import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ExpenseSheet } from '@/features/catalog/ExpenseSheet';
import { InventorySheet } from '@/features/catalog/InventorySheet';

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { name: 'Owner' }, can: () => true }),
}));

vi.mock('@/features/catalog/useCatalog', () => ({
  useMovements: () => ({
    isLoading: false,
    movements: [
      {
        id: 2,
        quantity_delta: -3,
        balance_after: 1,
        reason: 'sale',
        occurred_at: '2026-11-10T09:00:00Z',
        note: null,
      },
      {
        id: 1,
        quantity_delta: 4,
        balance_after: 4,
        reason: 'restock',
        occurred_at: '2026-11-01T09:00:00Z',
        note: 'Supplier delivery',
      },
    ],
  }),
}));

/*
 * The side panels that open a record without leaving its list (DetailSheet).
 * One anatomy for every record: header, headline figure, facts, actions.
 */

beforeAll(() => {
  // jsdom implements <dialog> without showModal.
  HTMLDialogElement.prototype.showModal ??= function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function close() {
    this.open = false;
  };
});

const EXPENSE = {
  id: 7,
  description: 'Warehouse air-conditioning repair',
  amount: '645.630',
  incurred_on: '2026-11-09',
  vendor: 'Dilmun Cooling',
  reference: null,
  notes: 'Compressor replaced under the service contract.',
  category: { id: 1, name: 'Maintenance' },
  created_at: '2026-11-09T10:00:00Z',
};

describe('an expense, opened from the list', () => {
  it('reads it first: the amount large, the facts as rows', () => {
    render(<ExpenseSheet expense={EXPENSE} onClose={() => {}} onEdit={() => {}} />);

    expect(
      screen.getByRole('heading', { name: 'Warehouse air-conditioning repair' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/645\.630/)).toBeInTheDocument();
    expect(screen.getAllByText('Maintenance').length).toBeGreaterThan(0);
    expect(screen.getByText('Dilmun Cooling')).toBeInTheDocument();
    expect(screen.getByText('Compressor replaced under the service contract.')).toBeInTheDocument();
  });

  it('shows an absent reference as visibly absent, not as a missing row', () => {
    render(<ExpenseSheet expense={EXPENSE} onClose={() => {}} onEdit={() => {}} />);

    expect(screen.getByText('Reference').nextElementSibling).toHaveTextContent('—');
  });

  it('edits only when asked, with one deliberate button', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<ExpenseSheet expense={EXPENSE} onClose={() => {}} onEdit={onEdit} />);

    await user.click(screen.getByRole('button', { name: 'Edit expense' }));

    expect(onEdit).toHaveBeenCalledWith(EXPENSE);
  });
});

describe('a stock line, opened from the list', () => {
  const ITEM = {
    product_id: 5,
    stock_on_hand: 1,
    threshold: 5,
    is_low: true,
    last_movement_at: '2026-11-10T09:00:00Z',
    product: { id: 5, sku: 'WB-1', name: 'Whiteboard', display_name: 'Whiteboard', unit: 'pcs' },
  };

  it('says how it stands, and at what level it is reordered', () => {
    render(<InventorySheet item={ITEM} onClose={() => {}} onAdjust={() => {}} />);

    expect(screen.getByText('Needs reordering')).toBeInTheDocument();
    expect(screen.getByText('1 pcs')).toBeInTheDocument();
    expect(screen.getByText('Reordered at 5')).toBeInTheDocument();
  });

  it('tells the story of the number, newest movement first', () => {
    render(<InventorySheet item={ITEM} onClose={() => {}} onAdjust={() => {}} />);

    const items = screen.getAllByRole('listitem').map((li) => li.textContent);

    expect(items[0]).toContain('Sold');
    expect(items[0]).toContain('−3');
    expect(items[1]).toContain('Received');
    expect(items[1]).toContain('+4');
    expect(screen.getByText('Supplier delivery')).toBeInTheDocument();
  });

  it('adjusts from the panel', async () => {
    const onAdjust = vi.fn();
    const user = userEvent.setup();
    render(<InventorySheet item={ITEM} onClose={() => {}} onAdjust={onAdjust} />);

    await user.click(screen.getByRole('button', { name: 'Adjust' }));

    expect(onAdjust).toHaveBeenCalledWith(ITEM);
  });
});
