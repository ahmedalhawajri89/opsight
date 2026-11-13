'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Renders its children once they come near the viewport, and keeps them.
 *
 * WHY. A screen of charts paid for every chart on arrival: Recharts measures,
 * lays out and animates each one on the main thread, and on a mid-range
 * phone the charts below the fold were most of the time the page spent
 * unable to answer a tap. Below the fold they can wait until they are about
 * to be seen. `margin` starts the work a little before they scroll in, so
 * the reader does not see them arrive.
 *
 * The placeholder holds `minHeight`, so the page below does not jump when
 * the real content replaces it. Without IntersectionObserver (old browsers,
 * the test environment) the children render at once.
 */
export function InView({ children, minHeight = 320, margin = '300px', className }) {
  const box = useRef(null);
  // False on the server and on the first client render alike, so the two agree.
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (seen || !box.current) return undefined;

    if (typeof window.IntersectionObserver === 'undefined') {
      const id = window.setTimeout(() => setSeen(true), 0);

      return () => window.clearTimeout(id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin },
    );

    observer.observe(box.current);

    /*
     * And once the page has gone quiet, whether or not it was scrolled to:
     * the work then costs a moment nobody is waiting on, and a reader who
     * jumps straight to the foot finds it already drawn.
     */
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(() => setSeen(true), { timeout: 4000 })
      : window.setTimeout(() => setSeen(true), 2500);

    return () => {
      observer.disconnect();
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, [seen, margin]);

  if (seen) return children;

  return <div ref={box} aria-hidden="true" className={className} style={{ minHeight }} />;
}
