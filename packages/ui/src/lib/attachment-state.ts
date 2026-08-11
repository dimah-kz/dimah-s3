import type { ComponentProps } from "react";
import { Attachment } from "@/components/ui/attachment";

/**
 * Attachment `state` values — derived from the stock shadcn {@link Attachment}
 * prop (do not edit `components/ui/attachment.tsx`).
 */
export type AttachmentState = NonNullable<
  ComponentProps<typeof Attachment>["state"]
>;
