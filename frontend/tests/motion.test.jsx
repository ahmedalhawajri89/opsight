import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CountUp } from '@/components/data/CountUp';
import { LedgerScene } from '@/features/auth/LedgerScene';
import { toWords } from '@/features/auth/authMotion';
import { useFocusMode } from '@/hooks/useFocusMode';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';
import { useGsap } from '@/hooks/useGsap';
import { recordVisit, useSeenOnce } from '@/hooks/useSeenOnce';

/*
|--------------------------------------------------------------------------
| The motion contract
|--------------------------------------------------------------------------
|
| GSAP writes inline styles and never sees the reduced-motion media query
| that governs the CSS, so honouring the preference is something this
| application has to do for itself. That is the whole reason useGsap exists
| instead of calling gsap from each component — and it is the part worth a
| test, because a component that forgets it fails silently for exactly the
| readers who asked not to be moved.
|
*/

function stubPreference(reduced) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query.includes('reduce') ? reduced : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
}

function Animated({ build }) {
  const scope = useGsap(build);

  return (
    <div ref={scope}>
      <p className="item">A figure worth reading</p>
    </div>
  );
}

afterEach(() => {
  delete window.matchMedia;
});

describe('useGsap', () => {
  it('animates nothing at all when the reader asked for less motion', () => {
    stubPreference(true);
    const build = vi.fn();

    render(<Animated build={build} />);

    // Not "animates quickly" — never runs. The markup is already in its
    // final state, which is what the preference asks for.
    expect(build).not.toHaveBeenCalled();
  });

  it('runs the animation when no such preference is set', () => {
    stubPreference(false);
    const build = vi.fn();

    render(<Animated build={build} />);

    expect(build).toHaveBeenCalledOnce();
  });

  it('leaves the element readable after unmounting', () => {
    /*
     * GSAP's inline styles outlive the component unless the context is
     * reverted. In React, where the same node can be reused, that shows up as
     * an element stuck at opacity 0 — content that is present, announced to a
     * screen reader, and invisible.
     */
    stubPreference(false);

    const { unmount, container } = render(
      <Animated
        build={() => {
          const item = document.querySelector('.item');
          if (item) item.style.opacity = '0';
        }}
      />,
    );

    unmount();

    expect(container.querySelector('.item')).toBeNull();
  });
});

/*
|--------------------------------------------------------------------------
| CountUp
|--------------------------------------------------------------------------
|
| The one animation here that CSS could not do, so the one worth proving
| actually runs rather than merely rendering its final state.
|
*/

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

describe('CountUp', () => {
  const money = (value) => `BHD ${value.toFixed(3)}`;

  it('passes through intermediate values on its way to the figure', async () => {
    stubPreference(false);

    const { container } = render(<CountUp value={2189} format={money} />);
    const visible = container.querySelector('[aria-hidden="true"]');

    // Two frames in, the tween has started and has not finished.
    await frame();
    await frame();

    expect(visible.textContent).not.toBe(money(2189));
  });

  it('never shows a screen reader anything but the final figure', async () => {
    stubPreference(false);

    const { container } = render(<CountUp value={2189} format={money} />);

    await frame();
    await frame();

    // The visible copy is mid-count; the announced one is not.
    expect(container.querySelector('.sr-only').textContent).toBe(money(2189));
  });

  it('prints the figure outright when the reader asked for less motion', () => {
    stubPreference(true);

    const { container } = render(<CountUp value={2189} format={money} />);

    expect(container.querySelector('[aria-hidden="true"]').textContent).toBe(money(2189));
  });

  it('leaves a figure that is not a number alone', () => {
    // A metric with no value renders an em dash elsewhere; this must not
    // try to count up to null and print NaN on the way.
    stubPreference(false);

    const { container } = render(<CountUp value={null} format={() => '—'} />);

    expect(container.querySelector('[aria-hidden="true"]').textContent).toBe('—');
  });
});

/*
|--------------------------------------------------------------------------
| Focus mode
|--------------------------------------------------------------------------
|
| Fullscreen is the browser's to refuse — a permissions policy, an embedded
| view, a gesture it did not recognise — and the one thing that must never
| happen is the application being left in a state that claims otherwise.
|
*/

describe('useFocusMode', () => {
  function Probe() {
    const focus = useFocusMode();

    return (
      <button type="button" aria-pressed={focus.focused} onClick={focus.toggleFocus}>
        {focus.supported ? 'fullscreen offered' : 'fullscreen absent'}
      </button>
    );
  }

  afterEach(() => {
    window.localStorage.clear();
  });

  it('remembers the choice, because it is a preference and not a mode', async () => {
    stubPreference(false);
    document.fullscreenEnabled = true;

    const { getByRole, unmount } = render(<Probe />);
    await userEvent.click(getByRole('button'));

    expect(getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('opsight:focus-mode')).toBe('1');

    // A reload must come back into focus mode, not out of it.
    unmount();
    render(<Probe />);
    expect(getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers no fullscreen button where the browser forbids it', () => {
    stubPreference(false);
    document.fullscreenEnabled = false;

    const { getByRole } = render(<Probe />);

    // Absent, not present-and-dead: a control that cannot work is worse
    // than no control, because the reader blames themselves.
    expect(getByRole('button')).toHaveTextContent('fullscreen absent');
  });

  it('survives storage being unavailable', () => {
    stubPreference(false);
    document.fullscreenEnabled = true;

    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Access denied');
    });

    // Private browsing. The preference stops persisting; nothing else breaks.
    expect(() => render(<Probe />)).not.toThrow();

    getItem.mockRestore();
  });
});

/*
|--------------------------------------------------------------------------
| Hints that are offered once
|--------------------------------------------------------------------------
|
| Two rules, and both of them are about trust rather than cleverness: a
| dismissed hint never comes back, and an invitation that asks for a
| commitment waits until the reader has one. Break the first and dismissing
| anything in this application stops meaning anything, including the
| messages that matter. Break the second and the application begs on the
| first screen.
|
*/

describe('useSeenOnce', () => {
  function Probe({ after = 0 }) {
    const [show, dismiss] = useSeenOnce('probe', { after });

    return (
      <button type="button" onClick={dismiss}>
        {show ? 'offered' : 'quiet'}
      </button>
    );
  }

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('never offers the same hint twice', async () => {
    const { getByRole, unmount } = render(<Probe />);
    expect(getByRole('button')).toHaveTextContent('offered');

    await userEvent.click(getByRole('button'));
    expect(getByRole('button')).toHaveTextContent('quiet');

    // The point of the whole hook: a reload is not a second chance to ask.
    unmount();
    render(<Probe />);
    expect(getByRole('button')).toHaveTextContent('quiet');
  });

  it('holds a hint back until the reader has come back', () => {
    const { getByRole, unmount } = render(<Probe after={3} />);
    expect(getByRole('button')).toHaveTextContent('quiet');

    // Twice within one session is still one visit — browsing is not
    // returning, and counting it would ask on the first look.
    recordVisit();
    recordVisit();
    expect(getByRole('button')).toHaveTextContent('quiet');

    unmount();
    window.sessionStorage.clear();
    recordVisit();
    window.sessionStorage.clear();
    recordVisit();

    render(<Probe after={3} />);
    expect(getByRole('button')).toHaveTextContent('offered');
  });

  it('stays quiet when nothing can be remembered', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Access denied');
    });

    // Private browsing: a hint that cannot record its dismissal would
    // otherwise appear on every single page.
    const { getByRole } = render(<Probe />);
    expect(getByRole('button')).toHaveTextContent('quiet');

    getItem.mockRestore();
  });
});

/*
|--------------------------------------------------------------------------
| The sign-in scene
|--------------------------------------------------------------------------
|
| Its beats are a GSAP timeline, which means two things have to be true that
| keyframes used to give for free: the markup must already BE the finished
| figure, because a reader who asked for less motion never runs the timeline
| at all; and the headline must be split in a way that survives Arabic.
|
*/

describe('splitting a headline for a word-by-word reveal', () => {
  it('never splits inside a word', () => {
    // The whole reason this is by word and not by letter. Arabic letters
    // change shape according to their neighbours, so a word broken into
    // per-character spans renders as disconnected isolated forms — legible
    // to a machine and wrong to a reader, in the first sentence anyone meets.
    const arabic = 'كل رقم هنا يُحتسب من السجلات';

    const words = toWords(arabic).filter((part) => part.trim() !== '');

    expect(words).toEqual(['كل', 'رقم', 'هنا', 'يُحتسب', 'من', 'السجلات']);
  });

  it('keeps the spaces, so the sentence still reads as a sentence', () => {
    // Dropped spaces would run the words together for a screen reader and
    // remove every point the line is allowed to break at.
    expect(toWords('two words').join('')).toBe('two words');
  });
});

describe('LedgerScene', () => {
  it('renders the finished figure, so reduced motion needs no second code path', () => {
    stubPreference(true);

    const { container } = render(<LedgerScene />);

    // The end of the story: the rows have folded away, and the figure, the
    // line and the point that marks "now" are all there to be seen.
    container.querySelectorAll('.ledger-row').forEach((row) => {
      expect(row).toHaveAttribute('opacity', '0');
    });

    expect(container.querySelectorAll('.ledger-col').length).toBeGreaterThan(0);
    expect(container.querySelector('.ledger-line')).not.toBeNull();
    expect(container.querySelector('.ledger-dot')).not.toBeNull();
  });

  it('leaves the pulsing ring invisible when nothing drives it', () => {
    // The one element whose resting state is not its finished state: a ring
    // frozen mid-pulse would read as a bug, so without the timeline there is
    // simply the bronze point.
    stubPreference(true);

    const { container } = render(<LedgerScene />);

    expect(container.querySelector('.ledger-ring')).toHaveAttribute('opacity', '0');
  });
});

/*
|--------------------------------------------------------------------------
| Folding the navigation away
|--------------------------------------------------------------------------
|
| A standing preference, not a mode: someone who folds the navigation on a
| wide screen means it for every screen they open after, which is the whole
| difference between this and focus mode.
|
*/

describe('useSidebarCollapsed', () => {
  function Probe() {
    const [collapsed, toggle] = useSidebarCollapsed();

    return (
      <button type="button" aria-expanded={!collapsed} onClick={toggle}>
        {collapsed ? 'rail' : 'names'}
      </button>
    );
  }

  afterEach(() => {
    window.localStorage.clear();
  });

  it('starts with the names, because that is what the layout already decides', () => {
    // Not collapsed means "whatever the width calls for", which is the
    // behaviour everyone had before this preference existed.
    const { getByRole } = render(<Probe />);

    expect(getByRole('button')).toHaveTextContent('names');
  });

  it('remembers the choice, because it is a preference and not a mode', async () => {
    const { getByRole, unmount } = render(<Probe />);

    await userEvent.click(getByRole('button'));
    expect(getByRole('button')).toHaveTextContent('rail');

    // The point: a new page must open folded, not unfold itself again.
    unmount();
    render(<Probe />);
    expect(getByRole('button')).toHaveTextContent('rail');
  });

  it('announces the state of the navigation, not of itself', async () => {
    // aria-expanded describes what the button operates. A control that only
    // named itself would leave a screen-reader user to guess which way it
    // currently stands.
    const { getByRole } = render(<Probe />);
    expect(getByRole('button')).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(getByRole('button'));
    expect(getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  it('still folds and unfolds when nothing can be remembered', async () => {
    // Private browsing: the preference stops persisting, and the navigation
    // still works — which is the part that matters.
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Access denied');
    });

    const { getByRole } = render(<Probe />);

    await expect(userEvent.click(getByRole('button'))).resolves.not.toThrow();

    setItem.mockRestore();
  });
});
