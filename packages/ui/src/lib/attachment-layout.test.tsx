import type { ComponentProps } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { render } from "@/test/render";
import { Attachment } from "@/components/ui/attachment";
import type { AttachmentState } from "@/lib/attachment-layout";

const STATES = [
  "idle",
  "uploading",
  "processing",
  "error",
  "done",
] as const satisfies readonly AttachmentState[];

describe("AttachmentState", () => {
  it("matches the states of the stock Attachment", () => {
    // `check-types` fails here when a shadcn sync changes the stock states.
    expectTypeOf<AttachmentState>().toEqualTypeOf<
      NonNullable<ComponentProps<typeof Attachment>["state"]>
    >();
    expectTypeOf<(typeof STATES)[number]>().toEqualTypeOf<AttachmentState>();

    for (const state of STATES) {
      const { container, unmount } = render(<Attachment state={state} />);
      expect(
        container
          .querySelector("[data-slot=attachment]")
          ?.getAttribute("data-state"),
      ).toBe(state);
      unmount();
    }
  });
});
