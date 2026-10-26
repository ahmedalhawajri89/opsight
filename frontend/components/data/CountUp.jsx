'use client';

import { useRef } from 'react';
import { gsap } from 'gsap';

import { useGsap } from '@/hooks/useGsap';

/**
 * A figure that counts up to itself when it arrives.
 *
 * WHY THIS IS THE ONE PLACE GSAP EARNS ITS KEEP HERE. Every entrance on this
 * dashboard — cards rising, sparklines wiping in — is CSS, which is cheaper,
 * already honours the reduced-motion media query, and needs no JavaScript to
 * run. Replacing that with a library would be a downgrade dressed as an
 * upgrade.
 *
 * What CSS cannot do is animate the TEXT of a number. On a screen whose whole
 * claim is that its figures are real and current, a headline that counts up is
 * the difference between a page that looks printed and one that looks live.
 *
 * TWO THINGS IT REFUSES TO DO.
 *
 * It does not interpolate the formatting. Each frame is re-formatted by the
 * caller's own `format` function, so a Bahraini dinar keeps three decimals, an
 * Arabic reader keeps Arabic-Indic digits if that is their preference, and the
 * thousands separator is the one the rest of the screen uses. Interpolating
 * the final string instead would produce "BHD 1,2•9.00" halfway through.
 *
 * It does not animate for a screen reader. The accessible text is the final
 * value from the first render; only the visible copy counts. A figure that
 * announces itself forty times on the way to its value is noise, and on a
 * dashboard with twelve of them it is unusable.
 */
export function CountUp({ value, format, className, duration = 0.9 }) {
  const display = useRef(null);
  const final = format(value);

  const scope = useGsap(
    () => {
      const node = display.current;

      if (node === null || typeof value !== 'number' || !Number.isFinite(value)) return;

      const counter = { current: 0 };

      gsap.to(counter, {
        current: value,
        duration,
        /*
         * Fast at first, settling at the end: the reader sees the order of
         * magnitude almost immediately and only the last digits resolve
         * slowly. An ease that accelerates would hide the figure until the
         * animation was nearly done, which is the opposite of useful.
         */
        ease: 'power2.out',
        onUpdate: () => {
          node.textContent = format(counter.current);
        },
        onComplete: () => {
          // Snapped to the real value: the tween's last frame is subject to
          // floating-point drift, and a figure that settles on 2,188.9997 is
          // a bug a reader can see.
          node.textContent = final;
        },
      });
    },
    [value, final],
  );

  return (
    <span ref={scope} className={className}>
      <span className="sr-only">{final}</span>
      <span ref={display} aria-hidden="true">
        {final}
      </span>
    </span>
  );
}
