/**
 * The conditions of a comparison: which screen each stage is on, and which screen a stage that has
 * just been mounted should begin on.
 *
 * This is deliberately not a selection store. Each surface still owns its own `activeId`; the stages
 * only need a rule for where a freshly mounted one starts, so that changing a role never leaves one
 * stage on a different screen from the other without the visitor having done it.
 */

/** The screen a comparison begins on and returns to: the middle, which has a neighbour each way. */
export function middleScreenId<Id extends string>(screens: readonly { readonly id: Id }[]): Id {
  return screens[Math.floor(screens.length / 2)]!.id;
}

export interface StageRoles<Id extends string = string> {
  readonly a: Id | undefined;
  readonly b: Id | undefined;
}

export interface StageScreens<ScreenId extends string = string> {
  readonly a: ScreenId | undefined;
  readonly b: ScreenId | undefined;
}

/**
 * The screen a stage mounted by a role change begins on, so that it lands level with the one that
 * stays. The stage that was kept is the one the visitor was already looking at, so it is the one
 * that carries over: A when only B changed, B when only A changed. When both changed (a swap) the
 * reference's screen carries over, because A is what everything is compared against. With nothing
 * mounted to carry over, the defined start applies.
 */
export function carryOverScreen<Id extends string, ScreenId extends string>(
  before: StageRoles<Id>,
  after: StageRoles<Id>,
  screens: StageScreens<ScreenId>,
  fallback: ScreenId,
): ScreenId {
  if (after.a !== undefined && after.a === before.a && screens.a !== undefined) return screens.a;
  if (after.b !== undefined && after.b === before.b && screens.b !== undefined) return screens.b;
  return screens.a ?? screens.b ?? fallback;
}

/** Whether two stages are on the same screen. A stage that does not exist cannot disagree. */
export function stagesLevel<ScreenId extends string>(screens: StageScreens<ScreenId>): boolean {
  return screens.a === undefined || screens.b === undefined || screens.a === screens.b;
}
