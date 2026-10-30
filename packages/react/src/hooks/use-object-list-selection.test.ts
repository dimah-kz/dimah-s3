import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createObjectListEntries } from "@/list/entries";
import type { ObjectListEntry, ObjectListFolder } from "@/list/types";
import {
  useObjectListSelection,
  type UseObjectListSelectionOptions,
} from "./use-object-list-selection";
import { renderHook } from "@/test/render-hook";

type Item = { id: string };

function entries(
  ids: string[],
  folders: ObjectListFolder[] = [],
): ObjectListEntry<Item>[] {
  return createObjectListEntries(
    folders,
    ids.map((id) => ({ id })),
    (item) => item.id,
    (item) => ({ name: item.id }),
  );
}

function setup(
  initial: { entries: ObjectListEntry<Item>[]; parent: string | null },
  options?: UseObjectListSelectionOptions<Item>,
) {
  const list = { ...initial };
  const hook = renderHook(() => useObjectListSelection(list, options));
  return {
    hook,
    update(next: Partial<typeof list>) {
      Object.assign(list, next);
      hook.rerender();
    },
  };
}

describe("useObjectListSelection", () => {
  it("toggles files and skips folders by default", () => {
    const { hook } = setup({
      entries: entries(["a", "b"], [{ id: "f", name: "F" }]),
      parent: null,
    });

    act(() => {
      hook.current.toggle("file:a");
      hook.current.toggle("folder:f");
    });

    expect(hook.current.count).toBe(1);
    expect(hook.current.selectedItems).toEqual([{ id: "a" }]);
    expect(hook.current.isSelected("file:a")).toBe(true);
    expect(hook.current.selectableCount).toBe(2);
    hook.unmount();
  });

  it("extends a range from the last toggled entry", () => {
    const { hook } = setup({
      entries: entries(["a", "b", "c", "d"]),
      parent: null,
    });

    act(() => {
      hook.current.toggle("file:b");
    });
    act(() => {
      hook.current.toggle("file:d", { range: true });
    });
    expect([...hook.current.selectedKeys]).toEqual([
      "file:b",
      "file:c",
      "file:d",
    ]);

    act(() => {
      hook.current.toggle("file:c", { range: true, value: false });
    });
    expect([...hook.current.selectedKeys]).toEqual(["file:d"]);
    hook.unmount();
  });

  it("selects every selectable entry and reports allSelected", () => {
    const { hook } = setup(
      { entries: entries(["a", "b"], [{ id: "f", name: "F" }]), parent: null },
      { isSelectable: () => true },
    );

    act(() => {
      hook.current.selectAll();
    });
    expect(hook.current.allSelected).toBe(true);
    expect(hook.current.selectedFolders).toEqual([{ id: "f", name: "F" }]);

    act(() => {
      hook.current.clear();
    });
    expect(hook.current.isSelecting).toBe(false);
    hook.unmount();
  });

  it("keeps one entry in single mode", () => {
    const { hook } = setup(
      { entries: entries(["a", "b"]), parent: null },
      { mode: "single" },
    );

    act(() => {
      hook.current.toggle("file:a");
    });
    act(() => {
      hook.current.toggle("file:b");
    });
    act(() => {
      hook.current.selectAll();
    });
    expect([...hook.current.selectedKeys]).toEqual(["file:b"]);
    hook.unmount();
  });

  it("clears when the folder changes and drops rows a reload removed", () => {
    const onSelectionChange = vi.fn();
    const { hook, update } = setup(
      { entries: entries(["a", "b"]), parent: null },
      { onSelectionChange },
    );

    act(() => {
      hook.current.select(["file:a", "file:b"]);
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ key: "file:a" }),
      expect.objectContaining({ key: "file:b" }),
    ]);

    update({ entries: entries(["a"]) });
    expect([...hook.current.selectedKeys]).toEqual(["file:a"]);

    update({ entries: entries(["x"]), parent: "photos" });
    expect(hook.current.count).toBe(0);
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
    hook.unmount();
  });

  it("keeps entries from other folders with persist", () => {
    const { hook, update } = setup(
      { entries: entries(["a"]), parent: null },
      { persist: true },
    );

    act(() => {
      hook.current.toggle("file:a");
    });
    update({ entries: entries(["b"]), parent: "photos" });
    act(() => {
      hook.current.toggle("file:b");
    });

    expect(hook.current.selectedItems).toEqual([{ id: "a" }, { id: "b" }]);
    expect(hook.current.allSelected).toBe(true);
    hook.unmount();
  });
});
