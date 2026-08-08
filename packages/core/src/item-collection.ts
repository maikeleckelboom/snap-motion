import { assertUniqueIds } from "./carousel-geometry";
import type { SemanticId } from "./types";

/**
 * The ordered semantic items a surface model is currently about.
 *
 * A surface resolves geometry from indexes, because geometry is about distance and order. But the
 * thing a route, a caption, or a consumer names is an ID, and an index is only a temporary answer
 * to "where is that ID right now". Keeping both in one owned collection is what lets a model be
 * reconfigured — reordered, extended, emptied — without any part of it going on believing a stale
 * ordinal, and without a caller having to perform array surgery on a model's private storage.
 */
export class OrderedIdCollection<Id extends SemanticId> {
  #ids: readonly Id[] = [];
  #indexes = new Map<Id, number>();

  constructor(ids: readonly Id[], name = "item") {
    this.replace(ids, name);
  }

  get ids(): readonly Id[] {
    return this.#ids;
  }

  get size(): number {
    return this.#ids.length;
  }

  /** The item's position, or `-1` when this collection does not contain it. */
  indexOf(id: Id): number {
    return this.#indexes.get(id) ?? -1;
  }

  /**
   * Where a surface starts: the item it was told to start on, or the middle of the collection when
   * it was told nothing. An ID this collection does not contain is not a starting point, and a
   * surface that silently started somewhere else would be lying about its own initial state.
   */
  resolveInitialIndex(id: Id | undefined, name = "initialId"): number {
    if (this.#ids.length === 0) return -1;
    if (id === undefined) return Math.floor(this.#ids.length / 2);
    const index = this.indexOf(id);
    if (index < 0) throw new RangeError(`${name} must identify an item: ${id}`);
    return index;
  }

  at(index: number): Id | undefined {
    return Number.isInteger(index) && index >= 0 ? this.#ids[index] : undefined;
  }

  /** True when the index names an item, which is the only thing a geometry command may act on. */
  contains(index: number): boolean {
    return Number.isInteger(index) && index >= 0 && index < this.#ids.length;
  }

  /**
   * Adopts a new ordering. Duplicate or non-string IDs are rejected here rather than silently
   * de-duplicated, because the same collection is what the surface's geometry is keyed by.
   */
  replace(ids: readonly Id[], name = "item"): void {
    assertUniqueIds(ids, name);
    this.#ids = [...ids];
    this.#indexes = new Map(this.#ids.map((id, index) => [id, index]));
  }
}

/**
 * Where a surface should stand after its items were reconfigured.
 *
 * Semantic identity wins: a collection that still contains the item the surface was on stays on
 * that item, however far it moved. When the item is gone the fallback is deliberately ordinal — the
 * surface holds its place in the list rather than jumping home — clamped into whatever the
 * collection now is, and `-1` once there is nothing left to stand on.
 */
export function resolvePreservedIndex<Id extends SemanticId>(
  collection: OrderedIdCollection<Id>,
  previousId: Id | undefined,
  previousIndex: number,
): number {
  if (collection.size === 0) return -1;
  const preserved = previousId === undefined ? -1 : collection.indexOf(previousId);
  if (preserved >= 0) return preserved;
  const ordinal = Number.isInteger(previousIndex) ? previousIndex : 0;
  return Math.min(Math.max(ordinal, 0), collection.size - 1);
}
