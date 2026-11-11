import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FileImportWizard } from '@/features/imports/FileImportWizard';
import * as admin from '@/services/admin';

vi.mock('@/services/admin', () => ({
  previewImport: vi.fn(),
  runImport: vi.fn(),
}));

/*
 * Importing from a spreadsheet (ADR-039).
 *
 * The server reads and checks the rows; what this screen must guarantee is
 * that what was checked is what gets written. Import is offered only after a
 * clean check, and taken away again the moment the mapping changes.
 */

const PREVIEW = {
  data: {
    headers: ['Order Number', 'Date', 'Product', 'Qty', 'Price'],
    sample: [['1001', '2026-03-05', 'Lamp', '2', '30']],
    mapping: { order_id: 0, date: 1, product_name: 2, quantity: 3, unit_price: 4 },
    rows: 1,
    fields: { order_id: true, date: true, product_name: false, quantity: false, unit_price: false },
  },
};

function renderWizard() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <FileImportWizard />
    </QueryClientProvider>,
  );
}

async function chooseFile(user) {
  const file = new File(['Order Number,Date\n1001,2026-03-05'], 'orders.csv', { type: 'text/csv' });
  await user.upload(screen.getByLabelText('File'), file);
  await screen.findByText(/1 rows found/);
}

beforeEach(() => {
  vi.mocked(admin.previewImport).mockReset().mockResolvedValue(PREVIEW);
  vi.mocked(admin.runImport).mockReset();
});

describe('the mapping', () => {
  it("shows each guess with the first row's value beside it", async () => {
    const user = userEvent.setup();
    renderWizard();
    await chooseFile(user);

    // "Lamp" under Product is right; under Quantity it would be visibly wrong.
    expect(screen.getByText('First row: Lamp')).toBeInTheDocument();
    expect(screen.getByLabelText(/Quantity/)).toHaveValue('3');
  });
});

describe('check, then import', () => {
  it('offers Import only after every row has read cleanly', async () => {
    const user = userEvent.setup();
    renderWizard();
    await chooseFile(user);

    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();

    vi.mocked(admin.runImport).mockResolvedValue({
      data: { written: false, records: 1, lines: 1, errors: [], error_count: 0 },
    });
    await user.click(screen.getByRole('button', { name: 'Check every row' }));

    await screen.findByText(/Every row reads cleanly/);
    expect(vi.mocked(admin.runImport).mock.lastCall[0]).toMatchObject({ dryRun: true });
    expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled();
  });

  it('takes Import away again when a column is changed after the check', async () => {
    /*
     * What was checked would no longer be what is written. The owner checks
     * again — one click — rather than importing rows nobody looked at.
     */
    const user = userEvent.setup();
    renderWizard();
    await chooseFile(user);

    vi.mocked(admin.runImport).mockResolvedValue({
      data: { written: false, records: 1, lines: 1, errors: [], error_count: 0 },
    });
    await user.click(screen.getByRole('button', { name: 'Check every row' }));
    await screen.findByText(/Every row reads cleanly/);

    await user.selectOptions(screen.getByLabelText(/Quantity/), '');

    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
    expect(screen.queryByText(/Every row reads cleanly/)).not.toBeInTheDocument();
  });

  it('lists the rows to fix, by spreadsheet row, and imports nothing', async () => {
    const user = userEvent.setup();
    renderWizard();
    await chooseFile(user);

    vi.mocked(admin.runImport).mockResolvedValue({
      data: {
        written: false,
        records: 0,
        lines: 0,
        error_count: 1,
        errors: [
          {
            row: 6,
            field: 'date',
            key: 'date',
            value: '31/02/2026',
            message: 'Date is not a date this import can read: “31/02/2026”.',
          },
        ],
      },
    });
    await user.click(screen.getByRole('button', { name: 'Check every row' }));

    expect(await screen.findByText(/1 rows need fixing/)).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '6' })).toBeInTheDocument();
    expect(screen.getByText(/31\/02\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });

  it('will not check until every required field has a column', async () => {
    vi.mocked(admin.previewImport).mockResolvedValue({
      data: { ...PREVIEW.data, mapping: { ...PREVIEW.data.mapping, date: null } },
    });

    const user = userEvent.setup();
    renderWizard();
    await chooseFile(user);

    expect(screen.getByRole('button', { name: 'Check every row' })).toBeDisabled();
    expect(screen.getByText(/Choose a column for every field marked required/)).toBeInTheDocument();
  });

  it('says what happened after writing, and that uploading again updates', async () => {
    const user = userEvent.setup();
    renderWizard();
    await chooseFile(user);

    vi.mocked(admin.runImport).mockResolvedValue({
      data: { written: false, records: 1, lines: 1, errors: [], error_count: 0 },
    });
    await user.click(screen.getByRole('button', { name: 'Check every row' }));
    await screen.findByText(/Every row reads cleanly/);

    vi.mocked(admin.runImport).mockResolvedValue({
      data: { written: true, records: 1, lines: 1, errors: [], error_count: 0 },
    });
    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(screen.getByText(/1 orders imported/)).toBeInTheDocument());
    expect(screen.getByText(/updates them rather than adding copies/)).toBeInTheDocument();
    expect(vi.mocked(admin.runImport).mock.lastCall[0]).toMatchObject({ dryRun: false });
  });
});
