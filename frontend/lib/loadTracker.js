/**
 * What is actually loading, read from TanStack Query's own caches.
 *
 * NO TIMERS. A loader that runs for a fixed time tells the reader nothing:
 * it is too slow on a fast network and lies on a slow one. This one watches
 * every query and mutation the application starts, and reports:
 *
 *   active    something is in flight right now
 *   progress  of everything started in this burst, the share that finished
 *   started   how many requests this burst has seen (0 when idle)
 *
 * A BURST begins when the first request starts after a quiet moment and ends
 * when the last one settles. A request that starts mid-burst joins it, so the
 * share can go DOWN as well as up: that is the truth, and the bar shows it
 * by slowing rather than jumping back.
 *
 * Queries that opt out with `meta: { silent: true }` are ignored, for
 * anything polled in the background that should never flash a loader.
 */
export function createLoadTracker(queryClient) {
  const queries = queryClient.getQueryCache();
  const mutations = queryClient.getMutationCache();

  let seen = new Set();
  let snapshot = { active: false, progress: 1, started: 0 };
  const listeners = new Set();

  function inFlight() {
    const running = new Set();

    for (const query of queries.getAll()) {
      if (query.meta?.silent) continue;
      if (query.state.fetchStatus === 'fetching') running.add(`q:${query.queryHash}`);
    }

    for (const mutation of mutations.getAll()) {
      if (mutation.state.status === 'pending') running.add(`m:${mutation.mutationId}`);
    }

    return running;
  }

  function recompute() {
    const running = inFlight();

    if (running.size === 0) {
      seen = new Set();
      if (snapshot.active) {
        snapshot = { active: false, progress: 1, started: 0 };
        listeners.forEach((listener) => listener());
      }

      return;
    }

    running.forEach((key) => seen.add(key));

    const finished = seen.size - running.size;
    const next = { active: true, progress: finished / seen.size, started: seen.size };

    if (
      next.active !== snapshot.active ||
      next.progress !== snapshot.progress ||
      next.started !== snapshot.started
    ) {
      snapshot = next;
      listeners.forEach((listener) => listener());
    }
  }

  const stopQueries = queries.subscribe(recompute);
  const stopMutations = mutations.subscribe(recompute);

  recompute();

  return {
    subscribe(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    destroy() {
      stopQueries();
      stopMutations();
      listeners.clear();
    },
  };
}
