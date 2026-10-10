import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

/**
 * Tracks which section crosses a thin band near the top of the viewport. It only observes: it
 * never scrolls, never writes history, and reads no scroll position, so it cannot interfere with
 * natural page scrolling or with a surface's own gestures.
 */
export function useActiveSection(ids: readonly string[]): Ref<string | undefined> {
  const active = ref<string | undefined>(ids[0]);
  let observer: IntersectionObserver | undefined;

  onMounted(() => {
    if (typeof IntersectionObserver === "undefined") return;
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting)
            active.value = entry.target.id === "top" ? ids[0] : entry.target.id;
        }
      },
      // A band between 30% and 40% of the viewport height from the top.
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    // Returning to the introduction must not leave the last visited section in the compact menu.
    const intro = document.getElementById("top");
    if (intro) observer.observe(intro);
  });

  onBeforeUnmount(() => observer?.disconnect());
  return active;
}
