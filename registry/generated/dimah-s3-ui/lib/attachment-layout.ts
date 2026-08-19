import type { ComponentProps, ReactNode } from "react";
import { Attachment } from "@/registry/dimah-s3-ui/components/ui/attachment";

/**
 * Attachment layout/state types — derived from stock shadcn {@link Attachment}
 * (do not edit `components/ui/attachment.tsx`).
 *
 * Named `attachment-layout` so the shadcn CLI does not collapse this module
 * onto the stock `attachment` primitive (same basename → `@/components/ui/attachment`).
 */
export type AttachmentState = NonNullable<
  ComponentProps<typeof Attachment>["state"]
>;

export type AttachmentSize = NonNullable<
  ComponentProps<typeof Attachment>["size"]
>;

export type AttachmentOrientation = NonNullable<
  ComponentProps<typeof Attachment>["orientation"]
>;

/** `size` / `orientation` forwarded onto stock `Attachment`. */
export type AttachmentLayoutProps = {
  size?: AttachmentSize;
  orientation?: AttachmentOrientation;
};

/**
 * Wired button/dropzone aliases — avoids clashing with Button `size`.
 * Maps to {@link AttachmentLayoutProps} on status rows.
 */
export type AttachmentLayoutAliases = {
  /** Attachment size (not the trigger button size). @default "sm" */
  attachmentSize?: AttachmentSize;
  /** Attachment orientation. @default "horizontal" */
  attachmentOrientation?: AttachmentOrientation;
};

/** Error description: allow wrap past truncate (AttachmentDescription default). */
export const ATTACHMENT_ERROR_DESCRIPTION_CLASS =
  "overflow-visible whitespace-normal [overflow-wrap:anywhere]";

/**
 * Title layout + dark-only shimmer highlight.
 * Stock `shimmer` brightens `currentColor` in dark mode; near-white titles
 * (typical `card-foreground`) make that band invisible. Override highlight
 * only in dark via the official `shimmer-color-*` utility + theme token —
 * leave light mode on the stock formula.
 */
export const ATTACHMENT_TITLE_CLASS =
  "max-w-[48ch] dark:shimmer-color-dimah-s3-muted-foreground";

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
