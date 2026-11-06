import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type {
  DeleteItem,
  DeleteOperation,
  FetchDownloadOperation,
  UseDeleteReturn,
  UseFetchDownloadReturn,
} from "@dimah-s3/react";
import { render, screen, waitFor, within } from "@/test/render";
import { ObjectCard } from "@/components/dimah-s3/preview/object-card";

const KEY = "invoices/2026/march.pdf";

function fakeDelete(operations: DeleteOperation[] = []): UseDeleteReturn {
  return {
    instanceId: "delete",
    operations,
    get: (key) => operations.findLast((operation) => operation.key === key),
    pendingKeys: operations
      .filter((operation) => operation.phase === "deleting")
      .map((operation) => operation.key),
    isPending: operations.some((operation) => operation.phase === "deleting"),
    remove: vi.fn(),
    removeMany: vi.fn(async (items: readonly DeleteItem[]) => ({
      deleted: items.map((item) =>
        typeof item === "string" ? item : item.key,
      ),
      failed: [],
      blocked: [],
    })),
    reset: vi.fn(),
  };
}

function fakeFetchDownload(
  operations: FetchDownloadOperation[] = [],
): UseFetchDownloadReturn {
  const pendingKeys = operations
    .filter((op) => op.phase === "presigning" || op.phase === "downloading")
    .map((op) => op.key);
  return {
    mode: "fetch",
    instanceId: "download",
    operations,
    get: (key) => operations.findLast((operation) => operation.key === key),
    pendingKeys,
    isPending: pendingKeys.length > 0,
    download: vi.fn(
      async (key: string) => ({ status: "aborted", key }) as const,
    ),
    cancel: vi.fn(),
    reset: vi.fn(),
  };
}

describe("ObjectCard", () => {
  it("names the object after its key, with a named action per hook", async () => {
    const download = fakeFetchDownload();
    render(
      <ObjectCard
        objectKey={KEY}
        fileSize={2048}
        download={download}
        delete={fakeDelete()}
      />,
    );

    expect(screen.getByTitle("march.pdf")).toBeDefined();
    expect(screen.getByText("2.0 KB")).toBeDefined();
    await userEvent.click(
      screen.getByRole("button", { name: "Download march.pdf" }),
    );
    expect(download.download).toHaveBeenCalledWith(KEY, {
      fileName: "march.pdf",
      fileSize: 2048,
    });
  });

  it("renders no actions without hooks", () => {
    render(<ObjectCard objectKey={KEY} fileName="March invoice.pdf" />);

    expect(screen.getByTitle("March invoice.pdf")).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("confirms a delete and reports it", async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    render(
      <ObjectCard
        objectKey={KEY}
        delete={fakeDelete()}
        onDeleted={onDeleted}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete march.pdf" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(onDeleted).toHaveBeenCalledWith(
        expect.objectContaining({ deleted: [KEY] }),
      ),
    );
  });

  it("shows the progress of a running fetch download", () => {
    const { container } = render(
      <ObjectCard
        objectKey={KEY}
        download={fakeFetchDownload([
          {
            id: "1",
            key: KEY,
            fileName: null,
            fileSize: null,
            phase: "downloading",
            error: null,
            progress: { loaded: 1024, total: 4096, percent: 25 },
          },
        ])}
      />,
    );

    expect(
      container
        .querySelector("[data-slot=attachment]")
        ?.getAttribute("data-state"),
    ).toBe("uploading");
    expect(
      screen
        .getByRole("progressbar", { name: "Progress for march.pdf" })
        .getAttribute("aria-valuenow"),
    ).toBe("25");
    expect(screen.getByText("1.0 KB of 4.0 KB")).toBeDefined();
  });

  it("shows a deleting state while its key deletes", () => {
    const { container } = render(
      <ObjectCard
        objectKey={KEY}
        delete={fakeDelete([
          {
            id: "1",
            key: KEY,
            batchId: "1",
            fileName: null,
            phase: "deleting",
            error: null,
          },
        ])}
      />,
    );

    expect(
      container
        .querySelector("[data-slot=attachment]")
        ?.getAttribute("data-state"),
    ).toBe("processing");
    expect(screen.getByText("Deleting…")).toBeDefined();
  });
});
