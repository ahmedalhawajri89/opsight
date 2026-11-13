import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VerifyEmail } from '@/features/auth/VerifyEmail';
import { VerifyEmailBanner } from '@/components/layout/VerifyEmailBanner';
import * as auth from '@/services/auth';

/*
 * Confirming an email address (security audit, 2026-11-13): the page the
 * emailed link opens, and the line that asks for it until it is done.
 */

let search = new URLSearchParams();
let user = null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/x',
  useSearchParams: () => search,
}));

vi.mock('@/features/auth/AuthProvider', () => ({
  AUTH_QUERY_KEY: ['auth', 'me'],
  useAuth: () => ({ user }),
}));

vi.mock('@/services/auth', () => ({
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
}));

function renderWithQuery(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  search = new URLSearchParams();
  user = null;
});

describe('VerifyEmail', () => {
  it('posts the link back once and says the address is confirmed', async () => {
    search = new URLSearchParams({ id: '7', expires: '1900000000', signature: 'a'.repeat(64) });
    auth.verifyEmail.mockResolvedValue({ message: 'ok' });

    renderWithQuery(<VerifyEmail />);

    expect(await screen.findByText(/address is confirmed/i)).toBeInTheDocument();
    expect(auth.verifyEmail).toHaveBeenCalledTimes(1);
    expect(auth.verifyEmail).toHaveBeenCalledWith({
      id: 7,
      expires: 1900000000,
      signature: 'a'.repeat(64),
    });
  });

  it('shows the server refusal for a link that no longer works', async () => {
    search = new URLSearchParams({ id: '7', expires: '1', signature: 'b'.repeat(64) });
    auth.verifyEmail.mockRejectedValue({
      isValidation: true,
      fieldErrors: { signature: 'This confirmation link is not valid any more.' },
    });

    renderWithQuery(<VerifyEmail />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid any more/);
  });

  it('does not call the server for an incomplete link', () => {
    search = new URLSearchParams({ id: '7' });

    renderWithQuery(<VerifyEmail />);

    expect(screen.getByRole('alert')).toHaveTextContent(/incomplete/i);
    expect(auth.verifyEmail).not.toHaveBeenCalled();
  });
});

describe('VerifyEmailBanner', () => {
  it('is not drawn for a confirmed account', () => {
    user = { email: 'owner@opsight.test', email_verified: true };

    const { container } = render(<VerifyEmailBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('asks an unconfirmed account to confirm, and sends the link again', async () => {
    user = { email: 'new@opsight.test', email_verified: false };
    auth.resendVerification.mockResolvedValue({});

    render(<VerifyEmailBanner />);

    expect(screen.getByText(/new@opsight\.test/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /send the link again/i }));

    expect(auth.resendVerification).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
  });
});
