import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test/render";
import { AttachmentAction } from "@/components/ui/attachment";
import { StatusAttachment } from "@/components/dimah-s3/attachment/status-attachment";

describe("StatusAttachment", () => {
  it("shows the title and description", () => {
    render(
      <StatusAttachment
        state="error"
        title="Upload failed"
        description="Network error"
      />,
    );

    expect(screen.getByText("Upload failed")).toBeDefined();
    expect(screen.getByText("Network error")).toBeDefined();
  });

  it("spins while processing unless media is given", () => {
    const { container, rerender } = render(
      <StatusAttachment state="processing" title="Preparing…" />,
    );
    expect(container.querySelector("[data-slot=spinner]")).not.toBeNull();

    rerender(
      <StatusAttachment
        state="processing"
        title="Preparing…"
        media={<span data-testid="custom" />}
      />,
    );
    expect(container.querySelector("[data-slot=spinner]")).toBeNull();
    expect(screen.getByTestId("custom")).toBeDefined();
  });

  it("renders actions before the dismiss control", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <StatusAttachment
        state="done"
        title="Download complete"
        actions={<AttachmentAction aria-label="Retry" />}
        onDismiss={onDismiss}
      />,
    );

    expect(
      screen.getAllByRole("button").map((button) => button.ariaLabel),
    ).toEqual(["Retry", "Dismiss"]);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("has no actions area without actions or dismiss", () => {
    const { container } = render(
      <StatusAttachment state="done" title="Done" />,
    );

    expect(
      container.querySelector("[data-slot=attachment-actions]"),
    ).toBeNull();
  });

  it("forwards div props and merges the class name", () => {
    render(
      <StatusAttachment state="done" data-testid="row" className="max-w-sm" />,
    );

    const row = screen.getByTestId("row");
    expect(row.getAttribute("data-state")).toBe("done");
    expect(row.classList.contains("max-w-sm")).toBe(true);
    expect(row.classList.contains("max-w-full")).toBe(false);
  });
});
