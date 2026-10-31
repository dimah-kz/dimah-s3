import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { s3Error, type S3Api } from "@dimah-s3/core";
import {
  useUpload,
  type UploadRequestOptions,
  type UseUploadOptions,
  type UseUploadReturn,
} from "@dimah-s3/react";
import { act, render, screen } from "@/test/render";
import {
  ObjectListProvider,
  type ObjectListContextValue,
} from "@/components/dimah-s3/list/object-list-context";
import { Upload } from "@/components/dimah-s3/upload/upload";
import { UploadDropzone } from "@/components/dimah-s3/upload/upload-dropzone";
import { UploadField } from "@/components/dimah-s3/upload/upload-field";
import { UploadTrigger } from "@/components/dimah-s3/upload/upload-trigger";

const unused = () => Promise.reject(new Error("not used in this test"));

/**
 * An `S3Api` whose route allows uploads. Presign fails with `FORBIDDEN`, so
 * a test reads what reached the server from the `upload` mock.
 */
function fakeApi() {
  return {
    catalog: vi.fn<S3Api["catalog"]>(async () => ({
      routes: {
        uploads: {
          upload: {
            enabled: true,
            maxFileSize: 1024,
            multipart: false,
            checksum: false,
          },
          download: { enabled: false },
          delete: { enabled: false },
        },
      },
    })),
    upload: vi.fn<S3Api["upload"]>(async () => {
      throw s3Error("FORBIDDEN");
    }),
    confirm: unused,
    download: unused,
    delete: unused,
    deleteMany: unused,
    multipart: {
      init: unused,
      signPart: unused,
      listParts: unused,
      complete: unused,
      abort: unused,
    },
  } satisfies S3Api;
}

type Api = ReturnType<typeof fakeApi>;

/** Renders `view` with a real `useUpload` on the `uploads` route. */
function renderUpload(
  view: (upload: UseUploadReturn) => ReactNode,
  options: Partial<UseUploadOptions> = {},
) {
  const api = fakeApi();
  function View() {
    return view(useUpload({ api, route: "uploads", ...options }));
  }
  return { api, ...render(<View />) };
}

/** Lets the hook load the catalog and run the upload calls. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

function textFile(name: string) {
  return new File(["hello"], name, { type: "text/plain" });
}

function fileInput() {
  const input = document.querySelector<HTMLInputElement>("input[type=file]");
  if (!input) throw new Error("No file input");
  return input;
}

/** Simulates a picker selection on the hidden file input. */
async function pick(files: File[]) {
  const input = fileInput();
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

/** A drag or paste event carrying `files`, shaped like the browser's. */
function filesEvent(type: "dragenter" | "drop" | "paste", files: File[]) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const data = {
    files,
    types: ["Files"],
    items: files.map((file) => ({
      kind: "file",
      type: file.type,
      getAsFile: () => file,
    })),
  };
  Object.defineProperty(
    event,
    type === "paste" ? "clipboardData" : "dataTransfer",
    { value: data },
  );
  return event;
}

async function fire(element: Element, event: Event) {
  await act(async () => {
    element.dispatchEvent(event);
  });
  await settle();
}

/** The `metadata` of every presign request, in order. */
function sentMetadata(api: Api) {
  return api.upload.mock.calls.map(([payload]) => payload.metadata);
}

/**
 * A minimal list context with `upload`, the open folder "docs" and the
 * source's `uploadOptions`.
 */
function listContext(
  upload: UseUploadReturn | null,
  uploadOptions: (parent: string | null) => UploadRequestOptions,
) {
  return {
    upload,
    list: { parent: "docs", uploadOptions },
  } as unknown as ObjectListContextValue<unknown>;
}

const folderOptions = (parent: string | null) => ({
  metadata: { folder: parent ?? "", source: "list" },
});

describe("Upload", () => {
  it("throws for a part rendered outside it", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<UploadTrigger />)).toThrow(
      "Upload parts must be rendered inside <Upload>",
    );
  });

  it("renders one hidden file input for its parts", async () => {
    const { container } = renderUpload((upload) => (
      <Upload upload={upload}>
        <UploadTrigger />
        <UploadDropzone />
      </Upload>
    ));
    await settle();

    expect(container.querySelectorAll("input[type=file]")).toHaveLength(1);
  });
});

describe("UploadTrigger", () => {
  it("names itself after the file count", async () => {
    const { unmount } = renderUpload((upload) => (
      <Upload upload={upload}>
        <UploadTrigger />
      </Upload>
    ));
    expect(screen.getByRole("button", { name: "Upload file" })).toBeDefined();
    unmount();

    renderUpload(
      (upload) => (
        <Upload upload={upload}>
          <UploadTrigger />
        </Upload>
      ),
      { maxFiles: 3 },
    );
    expect(screen.getByRole("button", { name: "Upload files" })).toBeDefined();
  });

  it("forwards button props and children", async () => {
    const onClick = vi.fn();
    renderUpload((upload) => (
      <Upload upload={upload}>
        <UploadTrigger
          variant="outline"
          className="w-full"
          aria-describedby="hint"
          onClick={onClick}
        >
          Add photos
        </UploadTrigger>
      </Upload>
    ));

    const button = screen.getByRole("button", { name: "Add photos" });
    await userEvent.click(button);

    expect(button.className).toContain("w-full");
    expect(button.getAttribute("aria-describedby")).toBe("hint");
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders through `render`", () => {
    renderUpload((upload) => (
      <Upload upload={upload}>
        <UploadTrigger nativeButton={false} render={<span />}>
          Add
        </UploadTrigger>
      </Upload>
    ));

    const trigger = screen.getByRole("button", { name: "Add" });
    expect(trigger.tagName).toBe("SPAN");
  });

  it("opens the picker and uploads the picked files with its call", async () => {
    const { api } = renderUpload((upload) => (
      <Upload upload={upload}>
        <UploadTrigger
          call={{ uploadOptions: { metadata: { from: "trigger" } } }}
        />
      </Upload>
    ));
    await settle();
    const click = vi.spyOn(fileInput(), "click");

    await userEvent.click(screen.getByRole("button", { name: "Upload file" }));
    expect(click).toHaveBeenCalledOnce();
    await pick([textFile("a.txt")]);

    expect(api.upload).toHaveBeenCalledOnce();
    expect(api.upload.mock.calls[0][0]).toMatchObject({
      route: "uploads",
      name: "a.txt",
      metadata: { from: "trigger" },
    });
  });

  it("keeps the picker closed when onClick prevents the default", async () => {
    renderUpload((upload) => (
      <Upload upload={upload}>
        <UploadTrigger onClick={(event) => event.preventDefault()} />
      </Upload>
    ));
    const click = vi.spyOn(fileInput(), "click");

    await userEvent.click(screen.getByRole("button", { name: "Upload file" }));

    expect(click).not.toHaveBeenCalled();
  });

  it("shows a tooltip only when one is given", async () => {
    renderUpload((upload) => (
      <Upload upload={upload}>
        <UploadTrigger tooltip="PNG or JPEG" />
      </Upload>
    ));

    await userEvent.hover(screen.getByRole("button", { name: "Upload file" }));

    expect(await screen.findByText("PNG or JPEG")).toBeDefined();
  });

  it("uploads into the open folder of an ObjectList with the same hook", async () => {
    const { api } = renderUpload((upload) => (
      <ObjectListProvider value={listContext(upload, folderOptions)}>
        <Upload upload={upload}>
          <UploadTrigger
            call={{ uploadOptions: { metadata: { source: "trigger" } } }}
          />
        </Upload>
      </ObjectListProvider>
    ));
    await settle();

    await userEvent.click(screen.getByRole("button", { name: "Upload file" }));
    await pick([textFile("a.txt")]);

    expect(sentMetadata(api)).toEqual([{ folder: "docs", source: "trigger" }]);
  });

  it("merges the folder under a per-file call", async () => {
    const { api } = renderUpload((upload) => (
      <ObjectListProvider value={listContext(upload, folderOptions)}>
        <Upload upload={upload}>
          <UploadTrigger
            call={{
              uploadOptions: (file) => ({ fileName: `copy-${file.name}` }),
            }}
          />
        </Upload>
      </ObjectListProvider>
    ));
    await settle();

    await userEvent.click(screen.getByRole("button", { name: "Upload file" }));
    await pick([textFile("a.txt")]);

    expect(api.upload.mock.calls[0][0]).toMatchObject({
      name: "copy-a.txt",
      metadata: { folder: "docs", source: "list" },
    });
  });

  it("keeps the folder inside a capped UploadField on the same hook", async () => {
    const { api } = renderUpload(
      (upload) => (
        <ObjectListProvider value={listContext(upload, folderOptions)}>
          <UploadField upload={upload} name="files" maxFiles={2}>
            <UploadTrigger />
          </UploadField>
        </ObjectListProvider>
      ),
      { maxFiles: 2 },
    );
    await settle();

    await userEvent.click(screen.getByRole("button", { name: "Upload files" }));
    await pick([textFile("a.txt")]);

    expect(sentMetadata(api)).toEqual([{ folder: "docs", source: "list" }]);
  });

  it("ignores the folder of an ObjectList with another hook", async () => {
    const { api } = renderUpload((upload) => (
      <ObjectListProvider value={listContext(null, folderOptions)}>
        <Upload upload={upload}>
          <UploadTrigger />
        </Upload>
      </ObjectListProvider>
    ));
    await settle();

    await userEvent.click(screen.getByRole("button", { name: "Upload file" }));
    await pick([textFile("a.txt")]);

    expect(sentMetadata(api)).toEqual([undefined]);
  });
});

describe("UploadDropzone", () => {
  it("is a button labelled by its text and described by the route limits", async () => {
    renderUpload(
      (upload) => (
        <Upload upload={upload}>
          <UploadDropzone />
        </Upload>
      ),
      { accept: ["image/png"] },
    );
    await settle();

    const dropzone = screen.getByRole("button", {
      name: "Drag and drop files here",
      description: "Up to 1.0 KB. Accepted PNG.",
    });
    expect(dropzone.tabIndex).toBe(0);
  });

  it("describes custom content with hidden hints and keeps extra ids", async () => {
    renderUpload((upload) => (
      <Upload upload={upload}>
        <UploadDropzone aria-describedby="extra">Drop a file</UploadDropzone>
        <p id="extra">Photos only.</p>
      </Upload>
    ));
    await settle();

    expect(
      screen.getByRole("button", {
        name: "Drop a file",
        description: "Up to 1.0 KB. Photos only.",
      }),
    ).toBeDefined();
    expect(screen.getByText("Up to 1.0 KB.").hidden).toBe(true);
  });

  it("prefers an aria-label over its own text", () => {
    renderUpload((upload) => (
      <Upload upload={upload}>
        <UploadDropzone aria-label="Attach files" />
      </Upload>
    ));

    expect(screen.getByRole("button", { name: "Attach files" })).toBeDefined();
  });

  it("uploads dropped files with its call", async () => {
    const { api } = renderUpload(
      (upload) => (
        <Upload upload={upload}>
          <UploadDropzone
            call={{ uploadOptions: { metadata: { from: "dropzone" } } }}
          />
        </Upload>
      ),
      { maxFiles: 2 },
    );
    await settle();

    await fire(
      screen.getByRole("button"),
      filesEvent("drop", [textFile("a.txt"), textFile("b.txt")]),
    );

    expect(api.upload.mock.calls.map(([payload]) => payload.name)).toEqual([
      "a.txt",
      "b.txt",
    ]);
    expect(sentMetadata(api)).toEqual([
      { from: "dropzone" },
      { from: "dropzone" },
    ]);
  });

  it("uploads files pasted while it has focus", async () => {
    const { api } = renderUpload((upload) => (
      <Upload upload={upload}>
        <UploadDropzone />
      </Upload>
    ));
    await settle();
    const dropzone = screen.getByRole("button");
    act(() => dropzone.focus());

    const event = filesEvent("paste", [textFile("pasted.txt")]);
    await fire(dropzone, event);

    expect(event.defaultPrevented).toBe(true);
    expect(api.upload.mock.calls[0][0]).toMatchObject({ name: "pasted.txt" });
  });

  it("uses the open folder of an ObjectList with the same hook", async () => {
    const { api } = renderUpload((upload) => (
      <ObjectListProvider value={listContext(upload, folderOptions)}>
        <Upload upload={upload}>
          <UploadDropzone />
        </Upload>
      </ObjectListProvider>
    ));
    await settle();

    await fire(
      screen.getByRole("button"),
      filesEvent("drop", [textFile("a.txt")]),
    );

    expect(sentMetadata(api)).toEqual([{ folder: "docs", source: "list" }]);
  });

  it("stays interactive and busy while files upload", async () => {
    const { api } = renderUpload(
      (upload) => (
        <Upload upload={upload}>
          <UploadDropzone className="custom" />
        </Upload>
      ),
      { queue: true, maxFiles: 2 },
    );
    api.upload.mockImplementationOnce(() => new Promise(() => {}));
    await settle();
    const dropzone = screen.getByRole("button");

    await fire(dropzone, filesEvent("drop", [textFile("a.txt")]));
    expect(dropzone.getAttribute("aria-busy")).toBe("true");
    expect(dropzone.className).not.toContain("pointer-events-none");
    expect(dropzone.className).toContain("custom");

    await fire(dropzone, filesEvent("drop", [textFile("b.txt")]));
    expect(api.upload).toHaveBeenCalledTimes(2);
  });

  it("is disabled with the hook", () => {
    renderUpload(
      (upload) => (
        <Upload upload={upload}>
          <UploadDropzone />
        </Upload>
      ),
      { disabled: true },
    );

    const dropzone = screen.getByRole("button");
    expect(dropzone.getAttribute("aria-disabled")).toBe("true");
    expect(dropzone.hasAttribute("tabindex")).toBe(false);
  });

  it.each([
    ["a.png", "image/png", "Drop to upload"],
    ["a.txt", "text/plain", "These files cannot be uploaded"],
  ])(
    "announces whether a dragged %s can be dropped",
    async (name, type, message) => {
      renderUpload(
        (upload) => (
          <Upload upload={upload}>
            <UploadDropzone />
          </Upload>
        ),
        { accept: ["image/png"] },
      );
      await settle();
      const region = document.querySelector("[aria-live=polite]");
      expect(region?.textContent).toBe("");

      await fire(
        screen.getByRole("button"),
        filesEvent("dragenter", [new File(["x"], name, { type })]),
      );

      expect(region?.textContent).toBe(message);
    },
  );
});
