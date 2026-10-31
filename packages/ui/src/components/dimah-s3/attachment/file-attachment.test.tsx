import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { s3Error } from "@dimah-s3/core";
import { render, screen } from "@/test/render";
import {
  AttachmentAction,
  AttachmentTrigger,
} from "@/components/ui/attachment";
import { FileAttachment } from "@/components/dimah-s3/attachment/file-attachment";

describe("FileAttachment", () => {
  it("shows the file name and size", () => {
    render(
      <FileAttachment state="done" fileName="report.pdf" fileSize={2048} />,
    );

    expect(screen.getByText("report.pdf")).toBeDefined();
    expect(screen.getByText("2.0 KB")).toBeDefined();
  });

  it("names the progress ring by the file while uploading", () => {
    render(
      <FileAttachment state="uploading" fileName="report.pdf" percent={64} />,
    );

    const bar = screen.getByRole("progressbar", {
      name: "Progress for report.pdf",
    });
    expect(bar.getAttribute("aria-valuenow")).toBe("64");
  });

  it("shows an empty ring while idle and no ring while processing", () => {
    const { rerender } = render(
      <FileAttachment state="idle" fileName="report.pdf" />,
    );
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "0",
    );

    rerender(<FileAttachment state="processing" fileName="report.pdf" />);
    expect(screen.queryByRole("progressbar")).toBeNull();

    rerender(<FileAttachment state="done" fileName="report.pdf" />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("formats an APIError and keeps a string error as is", () => {
    const { rerender } = render(
      <FileAttachment
        state="error"
        fileName="report.pdf"
        fileSize={2048}
        error={s3Error("NETWORK_ERROR")}
      />,
    );
    expect(screen.getByText("Network error")).toBeDefined();
    expect(screen.queryByText("2.0 KB")).toBeNull();

    rerender(
      <FileAttachment state="error" fileName="report.pdf" error="Too big" />,
    );
    expect(screen.getByText("Too big")).toBeDefined();

    rerender(<FileAttachment state="error" fileName="report.pdf" />);
    expect(screen.getByText("Upload failed")).toBeDefined();
  });

  it("prefers an explicit description", () => {
    render(
      <FileAttachment
        state="processing"
        fileName="report.pdf"
        fileSize={2048}
        description="Finishing…"
      />,
    );

    expect(screen.getByText("Finishing…")).toBeDefined();
    expect(screen.queryByText("2.0 KB")).toBeNull();
  });

  it("offers cancel only while the file is in flight", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { rerender } = render(
      <FileAttachment
        state="uploading"
        fileName="report.pdf"
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel report.pdf" }));
    expect(onCancel).toHaveBeenCalledOnce();

    rerender(
      <FileAttachment state="done" fileName="report.pdf" onCancel={onCancel} />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers dismiss only once the file has settled", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const { rerender } = render(
      <FileAttachment
        state="uploading"
        fileName="report.pdf"
        onDismiss={onDismiss}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();

    rerender(
      <FileAttachment
        state="error"
        fileName="report.pdf"
        onDismiss={onDismiss}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Dismiss report.pdf" }),
    );
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("renders extra actions before dismiss", () => {
    render(
      <FileAttachment
        state="done"
        fileName="report.pdf"
        actions={<AttachmentAction aria-label="Copy link" />}
        onDismiss={() => {}}
      />,
    );

    expect(
      screen.getAllByRole("button").map((button) => button.ariaLabel),
    ).toEqual(["Copy link", "Dismiss report.pdf"]);
  });

  it("keeps action clicks off the card trigger", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    render(
      <FileAttachment
        state="done"
        fileName="report.pdf"
        trigger={<AttachmentTrigger aria-label="Open" onClick={onOpen} />}
        onDismiss={onDismiss}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Dismiss report.pdf" }),
    );
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("shows a decorative preview image instead of the type glyph", () => {
    const { container } = render(
      <FileAttachment
        state="done"
        fileName="avatar.png"
        previewUrl="blob:avatar"
      />,
    );

    const media = container.querySelector("[data-slot=attachment-media]");
    expect(media?.getAttribute("data-variant")).toBe("image");
    expect(media?.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("forwards div props and merges the class name", () => {
    render(
      <FileAttachment
        state="done"
        fileName="report.pdf"
        data-testid="card"
        className="w-32"
      />,
    );

    const card = screen.getByTestId("card");
    expect(card.getAttribute("data-state")).toBe("done");
    expect(card.classList.contains("w-32")).toBe(true);
    expect(card.classList.contains("w-full")).toBe(false);
  });
});
