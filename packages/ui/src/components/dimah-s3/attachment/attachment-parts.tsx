"use client";

import type { ComponentProps } from "react";
import type { useRender } from "@base-ui/react/use-render";
import {
  AttachmentAction as StockAttachmentAction,
  AttachmentGroup as StockAttachmentGroup,
  AttachmentTrigger as StockAttachmentTrigger,
} from "@/components/ui/attachment";

/** Props for {@link AttachmentGroup}. Other props go to the `<div>`. */
export type AttachmentGroupProps = ComponentProps<"div">;

/** A horizontal row of attachment cards that scrolls and snaps. */
export function AttachmentGroup(props: AttachmentGroupProps) {
  return <StockAttachmentGroup {...props} />;
}

/** Props for {@link AttachmentAction}. Other props go to the `<button>`. */
export type AttachmentActionProps = ComponentProps<"button"> & {
  /**
   * Keeps a disabled button focusable, with `aria-disabled`, so focus
   * stays on it. @default false
   */
  focusableWhenDisabled?: boolean;
};

/**
 * An icon button in a card's actions, such as the `actions` of
 * `FileAttachment` or `ObjectCard`. Give it an `aria-label`.
 */
export function AttachmentAction(props: AttachmentActionProps) {
  return <StockAttachmentAction {...props} />;
}

/**
 * Props for {@link AttachmentTrigger}. Other props go to the `<button>`, or
 * to the element `render` returns, such as a link.
 */
export type AttachmentTriggerProps = useRender.ComponentProps<"button">;

/**
 * A button over the whole card, for the `trigger` of `FileAttachment` or
 * `ObjectCard`, so a click anywhere opens or downloads the file. The
 * card's actions stay above it. Give it an accessible name.
 */
export function AttachmentTrigger(props: AttachmentTriggerProps) {
  return <StockAttachmentTrigger {...props} />;
}
