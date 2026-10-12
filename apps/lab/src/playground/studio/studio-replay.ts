import { watch } from "vue";

/**
 * Calls `onReady` once, the first time `ready` is true: at once when it already is, otherwise in the
 * flush after it becomes true. It holds no subscription once it has called, and the returned
 * function cancels a wait that has not.
 *
 * It is a function of its own because the obvious spelling, an `immediate` watcher that stops itself
 * from its own callback, cannot do the second half. An immediate callback runs before `watch` has
 * returned the handle it would stop, so on the path where the condition already holds the watcher
 * outlives the wait and calls back again every time the condition next turns true.
 */
export function whenReady(ready: () => boolean, onReady: () => void): () => void {
  if (ready()) {
    onReady();
    return () => {};
  }
  const stop = watch(
    ready,
    (now) => {
      if (!now) return;
      stop();
      onReady();
    },
    { flush: "post" },
  );
  return stop;
}
