import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type {
  DeleteItem,
  DeleteOperation,
  DeleteResult,
  UseDeleteReturn,
} from "@dimah-s3/react";
import { render, renderHook, screen, waitFor } from "@/test/render";
import {
  Delete,
  useDeleteContext,
  type DeleteProps,
} from "@/components/dimah-s3/delete/delete";
import { DeleteConfirmDialog } from "@/components/dimah-s3/delete/delete-confirm-dialog";
import { DeleteTrigger } from "@/components/dimah-s3/delete/delete-trigger";

function keyOf(item: DeleteItem) {
  return typeof item === "string" ? item : item.key;
}

/** A `useDelete` return whose `removeMany` deletes every key. */
function fakeDelete(overrides: Partial<UseDeleteReturn> = {}): UseDeleteReturn {
  return {
    instanceId: "delete",
    operations: [],
    get: () => undefined,
    pendingKeys: [],
    isPending: false,
    remove: vi.fn<UseDeleteReturn["remove"]>(async (key) => ({
      status: "success",
      key,
      data: { key },
    })),
    removeMany: vi.fn<UseDeleteReturn["removeMany"]>(async (items) => ({
      deleted: items.map(keyOf),
      failed: [],
      blocked: [],
    })),
    reset: vi.fn<UseDeleteReturn["reset"]>(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function deleting(key: string): DeleteOperation {
  return {
    id: "1",
    key,
    batchId: "1",
    fileName: null,
    phase: "deleting",
    error: null,
  };
}

describe("Delete", () => {
  it("opens one alert dialog with the file and focus on Cancel", async () => {
    const user = userEvent.setup();
    render(
      <Delete delete={fakeDelete()}>
        <DeleteTrigger objectKey="docs/a.pdf" fileSize={2048} />
        <DeleteTrigger objectKey="docs/b.pdf" />
      </Delete>,
    );

    const [first] = screen.getAllByRole("button", { name: "Delete" });
    if (!first) throw new Error("No trigger");
    await user.click(first);

    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete file?",
    });
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    expect(dialog.textContent).toContain("a.pdf");
    expect(dialog.textContent).toContain("2.0 KB");
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Cancel" }),
      );
    });
  });

  it("deletes the targets on confirm and passes the result to onDeleted", async () => {
    const user = userEvent.setup();
    const result: DeleteResult = {
      deleted: [],
      failed: [],
      blocked: ["docs/a.pdf"],
    };
    const del = fakeDelete({
      removeMany: vi.fn<UseDeleteReturn["removeMany"]>(async () => result),
    });
    const onDeleted = vi.fn<NonNullable<DeleteProps["onDeleted"]>>();
    render(
      <Delete delete={del} onDeleted={onDeleted}>
        <DeleteTrigger objectKey="docs/a.pdf" fileName="Report.pdf" />
      </Delete>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Report.pdf");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(del.removeMany).toHaveBeenCalledExactlyOnceWith([
      { key: "docs/a.pdf", fileName: "Report.pdf" },
    ]);
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(onDeleted).toHaveBeenCalledExactlyOnceWith(result);
  });

  it("closes on Cancel without deleting and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const del = fakeDelete();
    render(
      <Delete delete={del}>
        <DeleteTrigger objectKey="docs/a.pdf" />
      </Delete>,
    );
    const trigger = screen.getByRole("button", { name: "Delete" });

    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
    expect(del.removeMany).not.toHaveBeenCalled();
  });

  it("restores focus to the focus root after the row unmounts", async () => {
    const user = userEvent.setup();

    function List() {
      const [keys, setKeys] = useState(["docs/a.pdf", "docs/b.pdf"]);
      return (
        <Delete
          delete={fakeDelete()}
          onDeleted={({ deleted }) => {
            setKeys((current) =>
              current.filter((key) => !deleted.includes(key)),
            );
          }}
        >
          <div data-dimah-s3-focus-root tabIndex={-1} data-testid="list">
            {keys.map((key) => (
              <DeleteTrigger key={key} objectKey={key}>
                {`Delete ${key}`}
              </DeleteTrigger>
            ))}
          </div>
        </Delete>
      );
    }
    render(<List />);

    await user.click(screen.getByRole("button", { name: "Delete docs/a.pdf" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId("list"));
    });
    expect(
      screen.queryByRole("button", { name: "Delete docs/a.pdf" }),
    ).toBeNull();
  });

  it("prefers restoreFocus over the trigger", async () => {
    const user = userEvent.setup();
    const restoreFocus = vi.fn<NonNullable<DeleteProps["restoreFocus"]>>(() =>
      document.getElementById("elsewhere"),
    );
    render(
      <Delete delete={fakeDelete()} restoreFocus={restoreFocus}>
        <DeleteTrigger objectKey="docs/a.pdf" />
        <button type="button" id="elsewhere">
          Elsewhere
        </button>
      </Delete>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Elsewhere" }),
      );
    });
    expect(restoreFocus).toHaveBeenCalledWith([{ objectKey: "docs/a.pdf" }]);
  });

  it("keeps the dialog open and sends one request while deleting", async () => {
    const user = userEvent.setup();
    const request = deferred<DeleteResult>();
    const del = fakeDelete({
      removeMany: vi.fn<UseDeleteReturn["removeMany"]>(() => request.promise),
    });
    render(
      <Delete delete={del}>
        <DeleteTrigger objectKey="docs/a.pdf" />
      </Delete>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = screen.getByRole("button", { name: "Delete" });
    await user.click(confirm);
    await user.click(confirm);
    await user.keyboard("{Escape}");

    expect(dialog.isConnected).toBe(true);
    expect(confirm.getAttribute("aria-busy")).toBe("true");
    expect(del.removeMany).toHaveBeenCalledOnce();

    request.resolve({ deleted: ["docs/a.pdf"], failed: [], blocked: [] });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  it("deletes several targets in one call with a count and a note", async () => {
    const user = userEvent.setup();
    const del = fakeDelete();

    function DeleteSelection() {
      const { request } = useDeleteContext();
      return (
        <button
          type="button"
          onClick={() => {
            request([{ objectKey: "a.png" }, { objectKey: "b.png" }], {
              note: "Folders stay in the list.",
            });
          }}
        >
          Delete selection
        </button>
      );
    }
    render(
      <Delete delete={del}>
        <DeleteSelection />
      </Delete>,
    );

    await user.click(screen.getByRole("button", { name: "Delete selection" }));
    // The note is part of the description, so it is read out on open.
    await screen.findByRole("alertdialog", {
      name: "Delete 2 files?",
      description: "This action cannot be undone. Folders stay in the list.",
    });
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(del.removeMany).toHaveBeenCalledExactlyOnceWith([
      { key: "a.png", fileName: undefined },
      { key: "b.png", fileName: undefined },
    ]);
  });

  it("renders the dialog passed as `dialog`", async () => {
    const user = userEvent.setup();
    render(
      <Delete
        delete={fakeDelete()}
        dialog={
          <DeleteConfirmDialog
            title="Remove photo?"
            description={<em>It is gone for good.</em>}
            confirmLabel="Remove"
            cancelLabel="Keep"
          />
        }
      >
        <DeleteTrigger objectKey="photo.png" />
      </Delete>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("alertdialog", {
      name: "Remove photo?",
    });
    expect(dialog.textContent).toContain("It is gone for good.");
    expect(screen.getByRole("button", { name: "Remove" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Keep" })).toBeDefined();
  });

  it("deletes at once without a dialog when confirm is false", async () => {
    const user = userEvent.setup();
    const del = fakeDelete();
    const onDeleted = vi.fn<NonNullable<DeleteProps["onDeleted"]>>();
    render(
      <Delete delete={del} confirm={false} onDeleted={onDeleted}>
        <DeleteTrigger objectKey="docs/a.pdf" />
      </Delete>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(del.removeMany).toHaveBeenCalledExactlyOnceWith([
      { key: "docs/a.pdf", fileName: undefined },
    ]);
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledExactlyOnceWith({
        deleted: ["docs/a.pdf"],
        failed: [],
        blocked: [],
      });
    });
  });

  it("throws for parts outside a root", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useDeleteContext())).toThrow(
      "inside <Delete>",
    );
  });
});

describe("DeleteTrigger", () => {
  it("is disabled and busy while its key is deleting", () => {
    const del = fakeDelete({
      get: (key) => (key === "docs/a.pdf" ? deleting(key) : undefined),
    });
    render(
      <Delete delete={del}>
        <DeleteTrigger objectKey="docs/a.pdf">Delete A</DeleteTrigger>
        <DeleteTrigger objectKey="docs/b.pdf">Delete B</DeleteTrigger>
      </Delete>,
    );

    const busy = screen.getByRole("button", { name: "Delete A" });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.getAttribute("aria-disabled")).toBe("true");
    const idle = screen.getByRole("button", { name: "Delete B" });
    expect(idle.hasAttribute("aria-busy")).toBe(false);
    expect(idle.hasAttribute("disabled")).toBe(false);
  });

  it("does not ask when its onClick prevents the default", async () => {
    const user = userEvent.setup();
    render(
      <Delete delete={fakeDelete()}>
        <DeleteTrigger
          objectKey="docs/a.pdf"
          onClick={(event) => {
            event.preventDefault();
          }}
        />
      </Delete>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
