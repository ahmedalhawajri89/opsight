'use client';

import { gsap } from 'gsap';

import { AUTH_MOTION } from './authMotion';
import { useGsap } from '@/hooks/useGsap';

/**
 * The fields arriving, animated by the form that owns them.
 *
 * WHY THIS IS NOT PART OF THE FRAME'S TIMELINE, which is where it started.
 * The sign-in form reads the query string, so it renders inside a Suspense
 * boundary — and when AuthLayout's layout effect ran, the fields did not
 * exist yet. GSAP said so on every page load ("target not found") and the
 * stagger silently never happened.
 *
 * Reaching further into the tree to find them would only have made the frame
 * depend on when a child decides to exist. The form knows exactly when its
 * fields are on the page: when it mounts. So the beat belongs here, and the
 * timing stays shared through AUTH_MOTION rather than copied.
 *
 * Returns the ref to put on the <form>.
 */
export function useFieldEntrance() {
  return useGsap((self) => {
    gsap.from(self.selector('[data-auth-field]'), {
      ...AUTH_MOTION.field,
      opacity: 0,
      y: 8,
    });
  });
}
