/**
 * What caused a surface to change its durable selection.
 *
 * Each value names an actual origin, and a surface only reports one once that origin has been
 * accepted as the movement now in flight. `drag` and `wheel` in particular are not "a pointer went
 * down" or "a wheel event arrived" — they are "this manipulation is what the surface is now
 * resolving", which is a question only the motion layer can answer.
 *
 * `picker` is a discrete selection: a tap on an item, a pagination dot. `programmatic` is an
 * imperative request from the application — `requestId()` and friends — which is a different thing
 * from a person choosing an item, and `route` is authoritative state the application already had.
 */
export type NavigationReason =
  | "previous"
  | "next"
  | "keyboard"
  | "drag"
  | "wheel"
  | "picker"
  | "programmatic"
  | "route";
