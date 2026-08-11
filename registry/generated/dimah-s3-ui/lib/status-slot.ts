import type { ReactNode } from "react";

/**
 * Controls inline status rendering for wired UI components.
 *
 * - `true` (default): render the status node in the default slot
 * - `false`: hide status
 * - `(node) => ReactNode`: wrap or relocate the status node
 */
export type StatusSlot = boolean | ((node: ReactNode) => ReactNode);

/** Resolve a {@link StatusSlot} against a built status node. */
export function resolveStatusSlot(
  slot: StatusSlot = true,
  node: ReactNode,
): ReactNode {
  if (slot === false) return null;
  if (typeof slot === "function") return slot(node);
  return node;
}
