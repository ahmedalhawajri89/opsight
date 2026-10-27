/**
 * The sign-in page's choreography, as numbers rather than scattered delays.
 *
 * WHY THIS FILE EXISTS. The scene used to be timed by hand in two places that
 * nothing kept in sync: keyframe delays in globals.css, and a separate list
 * of caption delays in the component. They had to agree, and only a person
 * reading both could tell whether they did — change the row animation and the
 * caption naming that beat drifts off it, silently, in the one screen every
 * visitor sees first.
 *
 * A timeline positions each beat relative to the one before, so the sequence
 * holds together by construction. These are the few absolute numbers it still
 * needs, named once.
 *
 * THE FORM NEVER WAITS FOR THE SHOW. Whoever opens this page came to type.
 * The card and its fields are done inside a third of a second; the
 * illustration's argument unfolds afterwards and is welcome to take longer,
 * because nobody is waiting on it. GSAP animates transforms and opacity, so
 * even mid-flight a field accepts a click and a keystroke.
 */
export const AUTH_MOTION = {
  /** The card and the fields: quick, because they are the task. */
  card: { duration: 0.4, ease: 'power2.out' },
  field: { duration: 0.3, stagger: 0.045, ease: 'power2.out' },

  /** The headline, word by word. */
  word: { duration: 0.5, stagger: 0.045, ease: 'power3.out' },

  /** The scene starts once the task is in place, not before. */
  sceneStart: 0.45,

  scene: {
    rowIn: 0.42,
    rowStagger: 0.07,
    rowOut: 0.34,
    column: 0.5,
    columnStagger: 0.06,
    line: 0.8,
    dot: 0.36,

    /** The pulse on "now". Long gaps: a heartbeat, not a strobe. */
    pulse: 1.6,
    pulseGap: 1.2,
  },
};

/**
 * Splits a sentence into words for a staggered reveal.
 *
 * BY WHITESPACE, NEVER BY CHARACTER. Arabic letters change shape according to
 * their neighbours, and a word split into per-character spans renders as
 * disconnected isolated forms — the headline would be legible to a machine
 * and wrong to a reader. Splitting between words leaves every word whole, so
 * shaping, ligatures and the bidirectional algorithm all still apply.
 *
 * The trailing space is kept on each word so the line still breaks naturally
 * and words do not run together when the spans are laid out inline.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function toWords(text) {
  return String(text)
    .split(/(\s+)/)
    .filter((part) => part !== '');
}
