import type { ComponentProps } from "react";
import type { Attachment } from "@/components/ui/attachment";

/**
 * Attachment state type, derived from the stock shadcn
 * {@link Attachment} (do not edit `components/ui/attachment.tsx`).
 *
 * Named `attachment-layout` so the shadcn CLI does not collapse this module
 * onto the stock `attachment` primitive (same basename → `@/components/ui/attachment`).
 */
export type AttachmentState = NonNullable<
  ComponentProps<typeof Attachment>["state"]
>;

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
