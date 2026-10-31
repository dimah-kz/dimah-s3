import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  s3Error,
  type RouteCatalogEntry,
  type RouteCatalogResponse,
  type S3Api,
} from "@dimah-s3/core";
import { fakeS3Api } from "@/test/api";
import { renderHook } from "@/test/render-hook";
import type { UploadResult, UseUploadOptions } from "@/types/upload";
import { uploadFile } from "@/upload/upload-file";
import { useUpload, type UseUploadReturn } from "./use-upload";

vi.mock("@/upload/upload-file", () => ({ uploadFile: vi.fn() }));

function resultFor(file: File): UploadResult {
  return {
    key: `uploads/${file.name}`,
    bucket: "bucket",
    name: file.name,
    size: file.size,
    metadata: {},
  };
}

function txt(name: string) {
  return new File(["text"], name, { type: "text/plain" });
}

function catalogOf(upload: RouteCatalogEntry["upload"]): RouteCatalogResponse {
  return {
    routes: {
      uploads: {
        upload,
        download: { enabled: false },
        delete: { enabled: false },
      },
    },
  };
}

function catalogApi(upload: RouteCatalogEntry["upload"]): S3Api {
  return fakeS3Api({ catalog: vi.fn(async () => catalogOf(upload)) });
}

/** Lets pending promises and React updates run. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

function mount(options: Partial<UseUploadOptions> = {}, api = fakeS3Api()) {
  return renderHook(() => useUpload({ api, route: "uploads", ...options }));
}

/** The `request` the engine got for each upload, in call order. */
function engineRequests() {
  return vi
    .mocked(uploadFile)
    .mock.calls.map(([, , options]) => options.request);
}

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** Mounts the hook with `view` rendered into a document-attached host. */
function render(
  options: Partial<UseUploadOptions>,
  view: (upload: UseUploadReturn) => ReactNode,
) {
  const api = fakeS3Api();
  function View() {
    return view(useUpload({ api, route: "uploads", ...options }));
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
  return (testId: string) => {
    const element = host.querySelector(`[data-testid="${testId}"]`);
    if (!element) throw new Error(`No element ${testId}`);
    return element;
  };
}

function dropEvent(files: File[]) {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      files,
      types: ["Files"],
      items: files.map((file) => ({
        kind: "file",
        type: file.type,
        getAsFile: () => file,
      })),
    },
  });
  return event;
}

async function drop(element: Element, files: File[]) {
  await act(async () => {
    element.dispatchEvent(dropEvent(files));
  });
  await flush();
}

beforeEach(() => {
  vi.mocked(uploadFile).mockReset();
  vi.mocked(uploadFile).mockImplementation(async (_api, file) =>
    resultFor(file),
  );
});

describe("useUpload", () => {
  it("merges call uploadOptions over the hook's, metadata key by key", async () => {
    const hook = mount({
      maxFiles: 2,
      uploadOptions: (file) => ({
        metadata: { owner: "me", folder: "" },
        contentType: `${file.type}; charset=utf-8`,
        fileName: `hook-${file.name}`,
      }),
    });

    await act(async () => {
      await hook.current.handleFiles([txt("a.txt")], {
        uploadOptions: { metadata: { folder: "docs" }, fileName: "call.txt" },
      });
    });

    expect(engineRequests()).toEqual([
      {
        metadata: { owner: "me", folder: "docs" },
        contentType: "text/plain; charset=utf-8",
        fileName: "call.txt",
      },
    ]);
    hook.unmount();
  });

  it("resolves handleFiles with every file's outcome", async () => {
    vi.mocked(uploadFile).mockImplementation(async (_api, file) => {
      if (file.name === "bad.txt") throw s3Error("NETWORK_ERROR");
      return resultFor(file);
    });
    const hook = mount({ maxFiles: 3 });
    const good = txt("good.txt");
    const bad = txt("bad.txt");

    let result: Awaited<ReturnType<UseUploadReturn["handleFiles"]>> | undefined;
    await act(async () => {
      result = await hook.current.handleFiles([good, bad]);
    });

    expect(result).toEqual({
      uploaded: [{ file: good, result: resultFor(good) }],
      failed: [
        {
          file: bad,
          error: expect.objectContaining({ code: "NETWORK_ERROR" }),
        },
      ],
      blocked: [],
      aborted: [],
    });
    expect(hook.current.phase).toBe("error");
    expect(hook.current.error?.code).toBe("NETWORK_ERROR");
    hook.unmount();
  });

  it("rejects invalid files with catalog codes and lowers maxFiles per call", async () => {
    const onFileReject = vi.fn();
    const hook = mount(
      { accept: ["text/plain"], maxFiles: 3, onFileReject },
      catalogApi({
        enabled: true,
        maxFileSize: 1024,
        multipart: false,
        checksum: false,
      }),
    );
    const exe = new File(["x"], "a.exe", { type: "application/x-msdownload" });
    const first = txt("a.txt");
    const second = txt("b.txt");

    await act(async () => {
      await hook.current.handleFiles([exe, first, second], { maxFiles: 1 });
    });

    const codes = hook.current.fileRejections.map(({ file, errors }) => [
      file.name,
      errors.map((error) => error.code),
    ]);
    expect(codes).toEqual([
      ["a.exe", ["FILE_TYPE_NOT_ALLOWED"]],
      ["b.txt", ["TOO_MANY_FILES"]],
    ]);
    expect(onFileReject).toHaveBeenCalledWith(hook.current.fileRejections);
    expect(vi.mocked(uploadFile).mock.calls.map(([, file]) => file)).toEqual([
      first,
    ]);
    hook.unmount();
  });

  it("follows the catalog for checksum and lets the hook turn multipart off", async () => {
    const hook = mount(
      { multipart: false },
      catalogApi({ enabled: true, multipart: true, checksum: true }),
    );
    await flush();

    expect(hook.current.policy).toMatchObject({
      multipart: false,
      checksum: true,
      maxFiles: 1,
      status: "ready",
    });
    await act(async () => {
      await hook.current.handleFiles(txt("a.txt"));
    });
    expect(vi.mocked(uploadFile).mock.calls[0]?.[2].policy).toEqual({
      multipart: false,
      checksum: true,
    });
    hook.unmount();
  });

  it("fails the files with the catalog error and recovers the policy on the next call", async () => {
    const catalog = vi
      .fn<S3Api["catalog"]>()
      .mockRejectedValueOnce(s3Error("NETWORK_ERROR"))
      .mockRejectedValueOnce(s3Error("NETWORK_ERROR"))
      .mockResolvedValue(
        catalogOf({ enabled: true, multipart: false, checksum: true }),
      );
    const hook = mount({}, fakeS3Api({ catalog }));
    await flush();
    expect(hook.current.policy).toMatchObject({
      status: "error",
      error: expect.objectContaining({ code: "NETWORK_ERROR" }),
    });

    let result: Awaited<ReturnType<UseUploadReturn["handleFiles"]>> | undefined;
    await act(async () => {
      result = await hook.current.handleFiles(txt("a.txt"));
    });
    expect(result?.failed.map(({ error }) => error.code)).toEqual([
      "NETWORK_ERROR",
    ]);
    expect(uploadFile).not.toHaveBeenCalled();

    await act(async () => {
      await hook.current.handleFiles(txt("b.txt"));
    });
    await flush();
    expect(hook.current.policy).toMatchObject({
      status: "ready",
      checksum: true,
    });
    expect(uploadFile).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it("has a stable instanceId and reports resumable from uploadStore", () => {
    const hook = mount({
      uploadStore: { get: () => null, set: () => {}, delete: () => {} },
    });
    const { instanceId, reset } = hook.current;

    hook.rerender();

    expect(hook.current.instanceId).toBe(instanceId);
    expect(hook.current.reset).toBe(reset);
    expect(hook.current.resumable).toBe(true);
    hook.unmount();

    const plain = mount();
    expect(plain.current.resumable).toBe(false);
    plain.unmount();
  });

  it("reports disabled, ignores open() and still uploads through handleFiles", async () => {
    const hook = mount({ disabled: true });
    expect(hook.current.disabled).toBe(true);
    expect(() => hook.current.open()).not.toThrow();

    let result!: Awaited<ReturnType<UseUploadReturn["handleFiles"]>>;
    await act(async () => {
      result = await hook.current.handleFiles(txt("a.txt"));
    });
    expect(result.uploaded.map(({ file }) => file.name)).toEqual(["a.txt"]);
    hook.unmount();

    const enabled = mount();
    expect(enabled.current.disabled).toBe(false);
    enabled.unmount();
  });

  it("gives drop targets no tabIndex, role, click or keyboard handlers", () => {
    const hook = mount();
    const props = hook.current.getDropTargetProps({ className: "row" });

    expect(props).not.toHaveProperty("tabIndex");
    expect(props).not.toHaveProperty("role");
    expect(props).not.toHaveProperty("onClick");
    expect(props).not.toHaveProperty("onKeyDown");
    expect(props).toMatchObject({
      className: "row",
      onDragEnter: expect.any(Function),
      onDragOver: expect.any(Function),
      onDragLeave: expect.any(Function),
      onDrop: expect.any(Function),
    });
    expect(hook.current.getRootProps()).toMatchObject({ tabIndex: 0 });
    hook.unmount();
  });

  it("uploads a drop on a folder row with the row's options merged over the hook's", async () => {
    const query = render(
      { maxFiles: 5, uploadOptions: { metadata: { owner: "me" } } },
      (upload) =>
        createElement(
          "section",
          upload.getRootProps({ "data-testid": "list" }, () => ({
            uploadOptions: { metadata: { folder: "" } },
          })),
          createElement(
            "div",
            upload.getDropTargetProps({ "data-testid": "row" }, () => ({
              uploadOptions: { metadata: { folder: "photos" } },
            })),
          ),
        ),
    );

    await drop(query("row"), [txt("a.txt")]);
    await drop(query("list"), [txt("b.txt")]);

    expect(engineRequests()).toEqual([
      { metadata: { owner: "me", folder: "photos" } },
      { metadata: { owner: "me", folder: "" } },
    ]);
  });

  it("validates dropped files that dropzone rejected with catalog codes", async () => {
    const onFileReject = vi.fn();
    const query = render({ onFileReject }, (upload) =>
      createElement("div", upload.getRootProps({ "data-testid": "zone" })),
    );

    await drop(query("zone"), [txt("a.txt"), txt("b.txt")]);

    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(onFileReject).toHaveBeenCalledWith([
      {
        file: expect.objectContaining({ name: "b.txt" }),
        errors: [expect.objectContaining({ code: "TOO_MANY_FILES" })],
      },
    ]);
  });
});
