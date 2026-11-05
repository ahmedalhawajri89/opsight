import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GOOGLE_ENABLED, GoogleSignIn } from '@/features/auth/GoogleSignIn';

describe('GoogleSignIn', () => {
  it('draws nothing at all until a client ID is configured', () => {
    // No divider, no empty box, and no script from Google: an installation
    // that has not set Google up must not show a control that cannot work.
    expect(GOOGLE_ENABLED).toBe(false);

    const { container } = render(<GoogleSignIn />);

    expect(container).toBeEmptyDOMElement();
    expect(document.querySelector('script[src*="accounts.google.com"]')).toBeNull();
  });
});
