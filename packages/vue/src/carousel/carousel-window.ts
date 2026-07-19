/** Semantic mount and preload windows for large carousels. */
import { computed, toValue, type MaybeRefOrGetter } from "vue";

export interface CarouselWindowOptions {
  readonly mountBefore: number;
  readonly mountAfter: number;
  readonly preloadBefore: number;
  readonly preloadAfter: number;
  readonly wrap?: boolean;
}

export interface CarouselWindowState<Id extends string> {
  readonly activeId: Id | undefined;
  readonly mountedIds: ReadonlySet<Id>;
  readonly nextIds: readonly Id[];
  readonly preloadIds: ReadonlySet<Id>;
  readonly previousIds: readonly Id[];
}

function normalizeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function collectWindow<Id extends string>(
  ids: readonly Id[],
  activeIndex: number,
  before: number,
  after: number,
  wrap: boolean,
): ReadonlySet<Id> {
  const result = new Set<Id>();
  if (activeIndex < 0 || ids.length === 0) return result;
  for (let offset = -before; offset <= after; offset += 1) {
    const rawIndex = activeIndex + offset;
    const index = wrap ? ((rawIndex % ids.length) + ids.length) % ids.length : rawIndex;
    const id = ids[index];
    if (id !== undefined) result.add(id);
  }
  return result;
}

/** Computes deterministic semantic mount and preload windows without fetching consumer media. */
export function useCarouselWindow<Id extends string>(
  idsSource: MaybeRefOrGetter<readonly Id[]>,
  activeIdSource: MaybeRefOrGetter<Id | undefined>,
  optionsSource: MaybeRefOrGetter<CarouselWindowOptions>,
) {
  const state = computed<CarouselWindowState<Id>>(() => {
    const ids = toValue(idsSource);
    const requestedActiveId = toValue(activeIdSource);
    const activeIndex = requestedActiveId === undefined ? -1 : ids.indexOf(requestedActiveId);
    const activeId = activeIndex >= 0 ? ids[activeIndex] : ids[0];
    const resolvedIndex = activeId === undefined ? -1 : ids.indexOf(activeId);
    const options = toValue(optionsSource);
    const wrap = options.wrap ?? false;
    return {
      activeId,
      mountedIds: collectWindow(
        ids,
        resolvedIndex,
        normalizeCount(options.mountBefore),
        normalizeCount(options.mountAfter),
        wrap,
      ),
      nextIds: resolvedIndex < 0 ? [] : ids.slice(resolvedIndex + 1),
      preloadIds: collectWindow(
        ids,
        resolvedIndex,
        normalizeCount(options.preloadBefore),
        normalizeCount(options.preloadAfter),
        wrap,
      ),
      previousIds: resolvedIndex < 0 ? [] : ids.slice(0, resolvedIndex),
    };
  });

  return {
    activeId: computed(() => state.value.activeId),
    mountedIds: computed(() => state.value.mountedIds),
    nextIds: computed(() => state.value.nextIds),
    preloadIds: computed(() => state.value.preloadIds),
    previousIds: computed(() => state.value.previousIds),
  };
}
