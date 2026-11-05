'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from './AuthProvider';
import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * "Continue with Google", for an account that already exists.
 *
 * NOTHING RENDERS UNTIL IT IS CONFIGURED. Without a client ID there is no
 * divider, no button and no script from Google, so an installation that has
 * not set Google up never shows a control that cannot work. The API is a 404
 * in the same case (GoogleSignInController).
 *
 * GOOGLE DRAWS ITS OWN BUTTON. Google Identity Services renders the button
 * into the container below; that is the button its branding rules allow, it
 * knows whether the reader is already signed in to Google, and it speaks the
 * page's language when told it. The script is loaded only on this screen, and
 * only once.
 *
 * The button gives back an ID token; the server checks it with Google and
 * signs in the account whose verified address it names.
 */
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

export const GOOGLE_ENABLED = Boolean(CLIENT_ID);

export function GoogleSignIn() {
  if (!GOOGLE_ENABLED) return null;

  return <GoogleButton />;
}

function GoogleButton() {
  const { loginWithGoogle } = useAuth();
  const { t, locale } = useI18n();
  const router = useRouter();
  const container = useRef(null);
  const [error, setError] = useState(null);

  /*
   * Held in a ref so the button is not torn down and redrawn whenever the
   * provider hands out a new function; it is redrawn for a language change,
   * which is the one thing that changes what it says.
   */
  const onCredential = useRef(null);

  useEffect(() => {
    onCredential.current = async ({ credential }) => {
      setError(null);

      try {
        await loginWithGoogle(credential);
        router.replace('/dashboard');
      } catch (failure) {
        setError(
          failure.isValidation
            ? (failure.fieldErrors.credential ?? failure.message)
            : failure.message,
        );
      }
    };
  }, [loginWithGoogle, router]);

  useEffect(() => {
    let cancelled = false;

    loadScript().then(() => {
      const node = container.current;

      if (cancelled || !node || !window.google?.accounts?.id) return;

      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response) => onCredential.current?.(response),
        ux_mode: 'popup',
        context: 'signin',
      });

      node.replaceChildren();
      window.google.accounts.id.renderButton(node, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        logo_alignment: 'center',
        width: Math.min(400, Math.round(node.getBoundingClientRect().width) || 320),
        locale,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  return (
    <div data-auth-field className="mt-6">
      <div className="flex items-center gap-3 text-xs text-(--color-muted)" aria-hidden="true">
        <span className="h-px flex-1 bg-(--color-line)" />
        {t('login.orContinue')}
        <span className="h-px flex-1 bg-(--color-line)" />
      </div>

      {/* A fixed height, so the card does not jump when Google's button arrives. */}
      <div ref={container} className="mt-4 flex min-h-11 justify-center" />

      {error && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-3 rounded-(--radius-control) bg-(--color-danger-soft) px-4 py-3 text-sm text-(--color-danger)"
        >
          <Icon name="alert" size={16} className="mt-1 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/* One <script> for the page's lifetime, however many times the button mounts. */
let scriptPromise = null;

function loadScript() {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Google Identity Services failed to load'));
    };
    document.head.appendChild(script);
  });

  // A blocked script (an ad blocker, a corporate proxy) must not throw into
  // the page: the password form is still right there.
  return scriptPromise.catch(() => undefined);
}
