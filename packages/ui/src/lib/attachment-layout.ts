/**
 * The states of an attachment card. Spelled out rather than read from the
 * stock shadcn Attachment, so a primitive sync cannot change the public
 * type; `attachment-layout.test.tsx` checks the two still match.
 *
 * Named `attachment-layout` so the shadcn CLI does not collapse this module
 * onto the stock `attachment` primitive (same basename → `@/components/ui/attachment`).
 */
export type AttachmentState =
  "idle" | "uploading" | "processing" | "error" | "done";

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
