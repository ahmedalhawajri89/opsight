import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UniversalConnection } from '@/features/integrations/UniversalConnection';
import { WooCommerceCard } from '@/features/integrations/WooCommerceCard';
import { PlatformLogo } from '@/components/brand/PlatformLogo';
import * as admin from '@/services/admin';

/*
 * The universal connection (2026-11-13): a key per system, shown in full once.
 */

vi.mock('@/services/admin', () => ({
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  connectWooCommerce: vi.fn(),
  claimStore: vi.fn(),
  zidAuthorizeUrl: vi.fn(),
  completeZid: vi.fn(),
  disconnectIntegration: vi.fn(),
}));

function renderWithQuery(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UniversalConnection', () => {
  it('shows a new key in full once, and only its prefix in the list', async () => {
    // Empty at first; after the key is made, the list the server sends back.
    admin.listApiKeys.mockResolvedValueOnce({ data: [] }).mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'WooCommerce',
          prefix: 'bydr_abcd1234',
          orders_received: 3,
          last_used_at: null,
        },
      ],
    });
    admin.createApiKey.mockResolvedValue({
      data: {
        id: 1,
        name: 'WooCommerce',
        prefix: 'bydr_abcd1234',
        secret: 'bydr_abcd1234_SECRETVALUE',
      },
    });

    renderWithQuery(<UniversalConnection />);

    expect(await screen.findByText(/No keys yet/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('System name'), 'WooCommerce');
    await userEvent.click(screen.getByRole('button', { name: /Make a key/ }));

    expect(admin.createApiKey).toHaveBeenCalledWith({ name: 'WooCommerce' });
    expect(await screen.findByText('bydr_abcd1234_SECRETVALUE')).toBeInTheDocument();
    expect(screen.getByText('Copy the key now')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.queryByText('bydr_abcd1234_SECRETVALUE')).toBeNull();
    expect(await screen.findByText('bydr_abcd1234_••••')).toBeInTheDocument();
    expect(screen.getByText('3 orders received')).toBeInTheDocument();
  });
});

describe('PlatformLogo', () => {
  it('draws the platform mark from the bundled file, and an icon for one without', () => {
    const { container, rerender } = render(<PlatformLogo platform="salla" />);

    expect(container.querySelector('img')).toHaveAttribute('src', '/brands/salla.svg');

    rerender(
      <PlatformLogo platform="api">
        <span>icon</span>
      </PlatformLogo>,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('icon')).toBeInTheDocument();
  });
});

describe('WooCommerceCard', () => {
  it("sends the address and the key, and shows the store's refusal beside the key", async () => {
    admin.connectWooCommerce.mockRejectedValue({
      isValidation: true,
      errors: { consumer_key: ['The store refused this key.'] },
    });

    renderWithQuery(<WooCommerceCard />);

    await userEvent.type(screen.getByLabelText('Store address'), ' https://shop.example.com ');
    await userEvent.type(screen.getByLabelText('Consumer key'), 'ck_abc');
    await userEvent.type(screen.getByLabelText(/Consumer secret/), 'cs_def');
    await userEvent.click(screen.getByRole('button', { name: /Connect WooCommerce/ }));

    expect(admin.connectWooCommerce).toHaveBeenCalledWith({
      url: 'https://shop.example.com',
      consumer_key: 'ck_abc',
      consumer_secret: 'cs_def',
    });
    expect(await screen.findByText('The store refused this key.')).toBeInTheDocument();
  });
});
