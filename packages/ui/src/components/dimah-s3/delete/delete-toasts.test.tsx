import { describe, expect, it, vi } from "vitest";
import { s3Error } from "@dimah-s3/core";
import type { DeleteOperation, UseDeleteReturn } from "@dimah-s3/react";
import { render } from "@/test/render";
import { toast } from "@/components/ui/toast";
import { FileName } from "@/components/dimah-s3/attachment/file-name";
import { DeleteToasts } from "@/components/dimah-s3/delete/delete-toasts";

function fakeDelete(operations: readonly DeleteOperation[]): UseDeleteReturn {
  return {
    instanceId: "delete",
    operations,
    get: (key) => operations.findLast((operation) => operation.key === key),
    pendingKeys: [],
    isPending: false,
    remove: vi.fn<UseDeleteReturn["remove"]>(),
    removeMany: vi.fn<UseDeleteReturn["removeMany"]>(),
    reset: vi.fn<UseDeleteReturn["reset"]>(),
  };
}

function operation(
  id: string,
  phase: DeleteOperation["phase"],
  fields: Partial<DeleteOperation> = {},
): DeleteOperation {
  return {
    id,
    key: `docs/${id}.pdf`,
    batchId: "1",
    fileName: null,
    phase,
    error: phase === "error" ? s3Error("FORBIDDEN") : null,
    ...fields,
  };
}

function toasts() {
  const add = vi.spyOn(toast, "add").mockReturnValue("toast");
  return () =>
    add.mock.calls.map(([options]) => ({
      type: options.type,
      title: options.title,
    }));
}

describe("DeleteToasts", () => {
  it("toasts a deleted file once, with its name", () => {
    const shown = toasts();
    const { rerender } = render(
      <DeleteToasts delete={fakeDelete([operation("1", "deleting")])} />,
    );
    expect(shown()).toEqual([]);

    const done = fakeDelete([
      operation("1", "success", { fileName: "Report.pdf" }),
    ]);
    rerender(<DeleteToasts delete={done} />);
    rerender(<DeleteToasts delete={{ ...done }} />);

    expect(shown()).toEqual([{ type: "success", title: "File deleted" }]);
    expect(vi.mocked(toast.add).mock.calls[0]?.[0].description).toEqual(
      <FileName name="Report.pdf" />,
    );
  });

  it("waits for the whole call and counts its keys", () => {
    const shown = toasts();
    const { rerender } = render(
      <DeleteToasts
        delete={fakeDelete([
          operation("1", "deleting"),
          operation("2", "deleting"),
          operation("3", "deleting"),
        ])}
      />,
    );

    rerender(
      <DeleteToasts
        delete={fakeDelete([
          operation("1", "success"),
          operation("2", "success"),
          operation("3", "deleting"),
        ])}
      />,
    );
    expect(shown()).toEqual([]);

    rerender(
      <DeleteToasts
        delete={fakeDelete([
          operation("1", "success"),
          operation("2", "success"),
          operation("3", "error"),
        ])}
      />,
    );
    expect(shown()).toEqual([
      { type: "success", title: "Deleted 2 files" },
      { type: "error", title: "Delete failed" },
    ]);
  });

  it("shows one shared cause for several failed keys", () => {
    const shown = toasts();
    const { rerender } = render(<DeleteToasts delete={fakeDelete([])} />);

    rerender(
      <DeleteToasts
        delete={fakeDelete([operation("1", "error"), operation("2", "error")])}
      />,
    );

    expect(shown()).toEqual([
      { type: "error", title: "Could not delete 2 files" },
    ]);
    expect(vi.mocked(toast.add).mock.calls[0]?.[0].description).toBeDefined();
  });

  it("toasts each `remove` call on its own", () => {
    const shown = toasts();
    const { rerender } = render(<DeleteToasts delete={fakeDelete([])} />);

    rerender(
      <DeleteToasts
        delete={fakeDelete([
          operation("1", "success", { batchId: null }),
          operation("2", "success", { batchId: null }),
        ])}
      />,
    );

    expect(shown()).toEqual([
      { type: "success", title: "File deleted" },
      { type: "success", title: "File deleted" },
    ]);
  });

  it("does not toast deletes that settled before mount", () => {
    const shown = toasts();

    render(<DeleteToasts delete={fakeDelete([operation("1", "success")])} />);

    expect(shown()).toEqual([]);
  });

  it("toasts once with two owners for the same hook", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const shown = toasts();
    const owners = (del: UseDeleteReturn) => (
      <>
        <DeleteToasts delete={del} />
        <DeleteToasts delete={del} />
      </>
    );
    const { rerender } = render(owners(fakeDelete([])));

    rerender(owners(fakeDelete([operation("1", "success")])));

    expect(shown()).toEqual([{ type: "success", title: "File deleted" }]);
  });
});
