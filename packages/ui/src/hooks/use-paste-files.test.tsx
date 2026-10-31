import { describe, expect, it, vi } from "vitest";
import type {
  UploadBatchResult,
  UploadCallOptions,
  UseUploadReturn,
} from "@dimah-s3/react";
import { renderHook } from "@/test/render";
import { usePasteFiles } from "@/hooks/use-paste-files";

const emptyBatch: UploadBatchResult = {
  uploaded: [],
  failed: [],
  blocked: [],
  aborted: [],
};

function fakeUpload() {
  return {
    handleFiles: vi.fn<UseUploadReturn["handleFiles"]>(async () => emptyBatch),
  };
}

/** Dispatches a cancelable paste carrying `files` from `target`. */
function paste(target: EventTarget, files: File[]) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { files } });
  target.dispatchEvent(event);
  return event;
}

const photo = new File(["png"], "photo.png", { type: "image/png" });

describe("usePasteFiles", () => {
  it("uploads pasted files with the call options and takes the paste", () => {
    const upload = fakeUpload();
    const call: UploadCallOptions = { maxFiles: 1 };
    renderHook(() => {
      usePasteFiles(upload, { call });
    });

    const event = paste(document.body, [photo]);

    expect(upload.handleFiles).toHaveBeenCalledExactlyOnceWith([photo], call);
    expect(event.defaultPrevented).toBe(true);
  });

  it("uses the newest call options without subscribing again", () => {
    const upload = fakeUpload();
    const { rerender } = renderHook(
      ({ call }: { call: UploadCallOptions }) => {
        usePasteFiles(upload, { call });
      },
      { initialProps: { call: { maxFiles: 1 } } },
    );

    rerender({ call: { maxFiles: 2 } });
    paste(document.body, [photo]);

    expect(upload.handleFiles).toHaveBeenCalledExactlyOnceWith([photo], {
      maxFiles: 2,
    });
  });

  it("leaves pastes into a form field alone", () => {
    const upload = fakeUpload();
    renderHook(() => {
      usePasteFiles(upload);
    });
    const input = document.createElement("input");
    document.body.append(input);

    const event = paste(input, [photo]);
    input.remove();

    expect(upload.handleFiles).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves a paste another handler already took", () => {
    const upload = fakeUpload();
    renderHook(() => {
      usePasteFiles(upload);
    });
    const dropzone = document.createElement("div");
    dropzone.addEventListener("paste", (event) => {
      event.preventDefault();
    });
    document.body.append(dropzone);

    paste(dropzone, [photo]);
    dropzone.remove();

    expect(upload.handleFiles).not.toHaveBeenCalled();
  });

  it("ignores a paste without files", () => {
    const upload = fakeUpload();
    renderHook(() => {
      usePasteFiles(upload);
    });

    const event = paste(document.body, []);

    expect(upload.handleFiles).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does nothing while disabled or after unmount", () => {
    const upload = fakeUpload();
    const { rerender, unmount } = renderHook(
      ({ enabled }: { enabled: boolean }) => {
        usePasteFiles(upload, { enabled });
      },
      { initialProps: { enabled: false } },
    );

    paste(document.body, [photo]);
    rerender({ enabled: true });
    unmount();
    paste(document.body, [photo]);

    expect(upload.handleFiles).not.toHaveBeenCalled();
  });
});
