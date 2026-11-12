'use client';

import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';

import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Every page arrives the same way: its blocks rise into place in reading
 * order, quickly, and then get out of the way.
 *
 * WHAT MOVES. The page's own blocks (the children of its root), and where a
 * block is a grid — a row of figures, a set of cards — the cells of that grid
 * one by one, so a row of four tiles reads as four things rather than one
 * slab. Nothing deeper: a table's rows do not dance.
 *
 * AND WHAT ARRIVES LATER. Most of a page is a skeleton for its first few
 * hundred milliseconds, and the real cards replace it when the data lands.
 * Animating only on navigation would spend the motion on the skeleton and
 * let the figures pop in. So for a short while after the page mounts, a
 * block or cell that is put in place is faded up too.
 *
 * FAST, because a dashboard is read, not watched: 320ms per block, 40ms
 * between them, the whole page settled in well under half a second. Only
 * opacity and transform, which the compositor can play without layout, and
 * cleared at the end so nothing is left holding an inline style. A reader
 * who asked for less motion gets none.
 *
 * Pages that choreograph their own entrance (the dashboard's band and
 * figures) say so with `data-own-motion` on their root and are left alone.
 *
 * @param {string} key  Re-runs on change; the pathname.
 * @returns {React.RefObject<HTMLElement>} The ref for <main>.
 */
export function usePageEntrance(key) {
  const scope = useRef(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const main = scope.current;

    if (reduced || !main) return undefined;

    const page = main.firstElementChild;

    if (page?.hasAttribute('data-own-motion')) return undefined;

    const seen = new WeakSet();

    /*
     * Only what is laid out on the page. A closed <dialog>, anything hidden,
     * and anything floating above the page (fixed or absolute) is not a
     * block of it: animating a closed dialog left GSAP's inline styles on it,
     * and it surfaced to assistive technology beside the one actually open.
     */
    function onPage(element) {
      if (!(element instanceof HTMLElement) || element.tagName === 'DIALOG') return false;

      const style = getComputedStyle(element);

      return style.display !== 'none' && !['fixed', 'absolute'].includes(style.position);
    }

    function targetsIn(block) {
      if (!onPage(block) || seen.has(block)) return [];
      seen.add(block);

      const display = getComputedStyle(block).display;

      if ((display === 'grid' || display === 'inline-grid') && block.children.length <= 24) {
        return [...block.children].filter((cell) => {
          if (seen.has(cell) || !onPage(cell)) return false;
          seen.add(cell);

          return true;
        });
      }

      return [block];
    }

    const first = page ? [...page.children].flatMap(targetsIn) : [];

    const context = gsap.context(() => {
      if (first.length > 0) {
        gsap.from(first, {
          autoAlpha: 0,
          y: 12,
          duration: 0.32,
          ease: 'power2.out',
          stagger: { each: 0.04, amount: Math.min(0.32, first.length * 0.04) },
          clearProps: 'opacity,visibility,transform',
        });
      }
    }, main);

    /*
     * Late arrivals: a block of the page, or a cell of one of its grids,
     * inserted after the first frame. Watched for a moment only — after that
     * a change is the reader's own doing (a filter, a new row) and should
     * simply be there.
     */
    const observer = new MutationObserver((records) => {
      const arrived = [];

      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement) || seen.has(node)) continue;

          // The page root itself, when a suspended route resolves late.
          if (node === main.firstElementChild) {
            if (!node.hasAttribute('data-own-motion')) {
              arrived.push(...[...node.children].flatMap(targetsIn));
            }

            continue;
          }

          const root = main.firstElementChild;
          const parent = node.parentElement;
          const isBlock = parent === root;
          const isCell =
            parent?.parentElement === root &&
            ['grid', 'inline-grid'].includes(getComputedStyle(parent).display);

          if ((isBlock || isCell) && onPage(node)) {
            seen.add(node);
            arrived.push(node);
          }
        }
      }

      if (arrived.length > 0) {
        context.add(() => {
          gsap.from(arrived, {
            autoAlpha: 0,
            y: 8,
            duration: 0.28,
            ease: 'power2.out',
            stagger: 0.035,
            clearProps: 'opacity,visibility,transform',
          });
        });
      }
    });

    observer.observe(main, { childList: true, subtree: true });

    const stop = window.setTimeout(() => observer.disconnect(), 2500);

    return () => {
      window.clearTimeout(stop);
      observer.disconnect();
      context.revert();
    };
  }, [key, reduced]);

  return scope;
}
