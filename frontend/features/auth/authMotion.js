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

  /*
   * The ruled sheet behind the card (AuthField) — the whole of the page's
   * ambient life, and all of it over inside three seconds.
   *
   * `rest` is the opacity a rule holds once it is drawn, and it is low on
   * purpose: this sits behind a password field, and the test of it is that
   * somebody typing never looks up. Anything that reads as an OBJECT rather
   * than as texture fails that test — which is what the drifting records
   * this replaced got wrong.
   */
  grid: {
    /** Seconds one rule takes to draw itself across. */
    draw: 0.9,
    /** Seconds between one rule starting and the next. */
    stagger: 0.05,
    /** Seconds the warm pool behind the card takes to come up. */
    glow: 1.4,
    /** The opacity a rule holds once drawn. */
    rest: 0.12,
  },

  scene: {
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
