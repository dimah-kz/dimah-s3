import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UploadCallOptions } from "@/types/upload";
import { renderHook } from "@/test/render-hook";
import {
  useFileIntake,
  type UseFileIntakeOptions,
  type UseFileIntakeReturn,
} from "./use-file-intake";

type Rendered = {
  readonly intake: UseFileIntakeReturn;
  query: (testId: string) => HTMLElement;
  input: () => HTMLInputElement;
};

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** Mounts the hook with `view` rendered into a document-attached host. */
function render(
  options: UseFileIntakeOptions,
  view: (intake: UseFileIntakeReturn) => ReactNode,
): Rendered {
  let intake!: UseFileIntakeReturn;
  function View() {
    intake = useFileIntake(options);
    return view(intake);
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(createElement(View));
  });
  cleanups.push(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });
  return {
    get intake() {
      return intake;
    },
    query: (testId) => {
      const element = host.querySelector<HTMLElement>(
        `[data-testid="${testId}"]`,
      );
      if (!element) throw new Error(`No element ${testId}`);
      return element;
    },
    input: () => {
      const element = host.querySelector("input");
      if (!element) throw new Error("No input");
      return element;
    },
  };
}

function file(name: string, type = "text/plain") {
  return new File(["x"], name, { type });
}

/** A drag event carrying `files`, shaped like the browser's. */
function dragEvent(type: string, files: File[]) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      files,
      types: ["Files"],
      items: files.map((entry) => ({
        kind: "file",
        type: entry.type,
        getAsFile: () => entry,
      })),
      dropEffect: "none",
    },
  });
  return event;
}

function pasteEvent(files: File[]) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { files, types: ["Files"], items: [] },
  });
  return event;
}

/** Dispatches `event` and lets dropzone read the files. */
async function fire(element: Element, event: Event) {
  await act(async () => {
    element.dispatchEvent(event);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

function pick(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  return fire(input, new Event("change", { bubbles: true }));
}

const rootCall: UploadCallOptions = {
  uploadOptions: { metadata: { at: "root" } },
};
const rowCall: UploadCallOptions = {
  uploadOptions: { metadata: { at: "row" } },
};

/** A dropzone root with an input and a drop target inside it. */
function dropzoneView(intake: UseFileIntakeReturn) {
  return createElement(
    "div",
    intake.getRootProps({ "data-testid": "root" }, rootCall),
    createElement("input", intake.getInputProps({ name: "files" })),
    createElement(
      "div",
      intake.getDropTargetProps({ "data-testid": "row" }, () => rowCall),
      createElement("span", { "data-testid": "row-label" }),
    ),
  );
}

describe("useFileIntake", () => {
  it("puts the HTML accept list on the file input", () => {
    const hook = renderHook(() =>
      useFileIntake({
        accept: ["image/*", ".pdf"],
        maxFiles: 1,
        onFiles: vi.fn(),
      }),
    );

    expect(hook.current.getInputProps().accept).toBe("image/*,.pdf");
    hook.unmount();
  });

  it("omits accept on the input when no tokens are set", () => {
    const hook = renderHook(() =>
      useFileIntake({ maxFiles: 1, onFiles: vi.fn() }),
    );
    expect(hook.current.getInputProps().accept).toBeUndefined();
    hook.unmount();
  });

  it("opens a mounted input after another input of the same hook unmounts", () => {
    const hook = renderHook(() =>
      useFileIntake({ maxFiles: 1, onFiles: vi.fn() }),
    );
    const { ref } = hook.current.getInputProps() as {
      ref: (node: HTMLInputElement | null) => void;
    };
    const host = document.createElement("div");
    document.body.append(host);
    const kept = document.createElement("input");
    const removed = document.createElement("input");
    host.append(kept, removed);
    const keptClick = vi.spyOn(kept, "click").mockImplementation(() => {});
    const removedClick = vi.spyOn(removed, "click");

    ref(kept);
    ref(removed);
    removed.remove();
    ref(null);
    hook.current.open();

    expect(keptClick).toHaveBeenCalledTimes(1);
    expect(removedClick).not.toHaveBeenCalled();
    host.remove();
    hook.unmount();
  });

  it("passes dropped files with the root's call options", async () => {
    const onFiles = vi.fn();
    const view = render({ maxFiles: 5, onFiles }, dropzoneView);
    const dropped = [file("a.txt"), file("b.txt")];

    await fire(view.query("root"), dragEvent("drop", dropped));

    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles).toHaveBeenCalledWith(dropped, rootCall);
  });

  it("gives a drop on a target inside the root to the target only", async () => {
    const onFiles = vi.fn();
    const view = render({ maxFiles: 5, onFiles }, dropzoneView);
    const dropped = [file("a.txt")];

    await fire(view.query("row-label"), dragEvent("drop", dropped));

    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles).toHaveBeenCalledWith(dropped, rowCall);
  });

  it("passes files dropzone rejected, in order, so they can be validated once", async () => {
    const onFiles = vi.fn();
    const view = render(
      { accept: ["image/*"], maxFiles: 1, onFiles },
      dropzoneView,
    );
    const dropped = [file("a.png", "image/png"), file("b.png", "image/png")];

    await fire(view.query("root"), dragEvent("drop", dropped));

    expect(onFiles).toHaveBeenCalledWith(dropped, rootCall);
  });

  it("gives a drop target drag and drop handlers only", () => {
    const hook = renderHook(() =>
      useFileIntake({ maxFiles: 1, onFiles: vi.fn() }),
    );
    const onDragOver = vi.fn();
    const props = hook.current.getDropTargetProps({ onDragOver });

    expect(Object.keys(props).sort()).toEqual([
      "onDragEnter",
      "onDragLeave",
      "onDragOver",
      "onDrop",
    ]);
    expect(props).not.toHaveProperty("tabIndex");
    expect(props).not.toHaveProperty("onClick");
    expect(props.onDragOver).not.toBe(onDragOver);
    hook.unmount();
  });

  it("keeps only the consumer's handlers on a drop target when disabled", () => {
    const hook = renderHook(() =>
      useFileIntake({ maxFiles: 1, disabled: true, onFiles: vi.fn() }),
    );
    const onDrop = vi.fn();

    expect(hook.current.getDropTargetProps({ onDrop })).toEqual({ onDrop });
    hook.unmount();
  });

  it("marks the drop target while files are dragged over it", async () => {
    const view = render({ maxFiles: 1, onFiles: vi.fn() }, dropzoneView);
    const row = view.query("row");
    const label = view.query("row-label");
    const dragged = [file("a.txt")];

    await fire(row, dragEvent("dragenter", dragged));
    await fire(label, dragEvent("dragenter", dragged));
    await fire(row, dragEvent("dragleave", dragged));
    expect(row.getAttribute("data-drag-active")).toBe("true");
    expect(view.intake.isDragActive).toBe(true);

    await fire(label, dragEvent("dragleave", dragged));
    expect(row.hasAttribute("data-drag-active")).toBe(false);

    await fire(label, dragEvent("dragenter", dragged));
    await fire(label, dragEvent("drop", dragged));
    expect(row.hasAttribute("data-drag-active")).toBe(false);
    expect(view.intake.isDragActive).toBe(false);
  });

  it("gives picked files the call options of the latest open", async () => {
    const onFiles = vi.fn();
    const view = render({ maxFiles: 1, onFiles }, dropzoneView);
    const input = view.input();
    vi.spyOn(input, "click").mockImplementation(() => {});
    const picked = [file("a.txt")];

    act(() => {
      view.intake.open(rowCall);
    });
    await pick(input, picked);
    expect(onFiles).toHaveBeenLastCalledWith(picked, rowCall);

    act(() => {
      view.intake.open();
    });
    await pick(input, picked);
    expect(onFiles).toHaveBeenLastCalledWith(picked, undefined);

    await act(async () => {
      view.query("root").click();
    });
    await pick(input, picked);
    expect(onFiles).toHaveBeenLastCalledWith(picked, rootCall);
  });

  it("leaves a paste to a consumer handler that prevented its default", async () => {
    const onFiles = vi.fn();
    let takeOver = true;
    const view = render({ maxFiles: 1, onFiles }, (intake) =>
      createElement(
        "div",
        intake.getRootProps(
          {
            "data-testid": "root",
            onPaste: (event) => {
              if (takeOver) event.preventDefault();
            },
          },
          rootCall,
        ),
      ),
    );
    const pasted = [file("a.png", "image/png")];

    await fire(view.query("root"), pasteEvent(pasted));
    expect(onFiles).not.toHaveBeenCalled();

    takeOver = false;
    await fire(view.query("root"), pasteEvent(pasted));
    expect(onFiles).toHaveBeenCalledWith(pasted, rootCall);
  });

  it("rejects a drag by MIME type only when every accept token is a MIME type", async () => {
    const dragged = [file("a.txt")];
    const mimeOnly = render(
      { accept: ["image/*"], maxFiles: 1, onFiles: vi.fn() },
      dropzoneView,
    );
    await fire(mimeOnly.query("root"), dragEvent("dragenter", dragged));
    expect(mimeOnly.intake.isDragReject).toBe(true);

    const withExtension = render(
      { accept: ["image/*", ".txt"], maxFiles: 1, onFiles: vi.fn() },
      dropzoneView,
    );
    await fire(withExtension.query("root"), dragEvent("dragenter", dragged));
    expect(withExtension.intake.isDragActive).toBe(true);
    expect(withExtension.intake.isDragReject).toBe(false);
    expect(withExtension.intake.isDragAccept).toBe(false);
  });
});
