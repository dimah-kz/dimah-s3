import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { s3Error } from "@dimah-s3/core";
import type {
  FileRejection,
  UploadFilePhase,
  UploadFileState,
  UseUploadReturn,
} from "@dimah-s3/react";
import { render, screen, waitFor } from "@/test/render";
import { Toaster } from "@/components/ui/toast";
import { UploadToasts } from "@/components/dimah-s3/upload/upload-toasts";

function fileState(id: string, phase: UploadFilePhase): UploadFileState {
  const file = new File(["x".repeat(2048)], `${id}.txt`, {
    type: "text/plain",
  });
  return {
    id,
    file,
    fileName: file.name,
    fileSize: file.size,
    contentType: file.type,
    previewUrl: null,
    phase,
    progress: { loaded: 0, total: file.size, percent: 0 },
    error: phase === "error" ? s3Error("NETWORK_ERROR") : null,
    result: null,
  };
}

const cancel = vi.fn<UseUploadReturn["cancel"]>();

/** A `useUpload` return in a fixed state. Only the fields toasts read matter. */
function stubUpload(overrides: Partial<UseUploadReturn> = {}): UseUploadReturn {
  const files = overrides.files ?? [];
  return {
    instanceId: "upload",
    files,
    file: files[0] ?? null,
    phase: "idle",
    progress: { loaded: 0, total: 0, percent: 0 },
    error: null,
    isPending: false,
    policy: {
      status: "ready",
      error: null,
      multipart: false,
      checksum: false,
      maxFiles: 5,
    },
    resumable: false,
    disabled: false,
    handleFiles: vi.fn(),
    open: vi.fn(),
    cancel,
    detach: vi.fn(),
    reset: vi.fn(),
    getRootProps: (props) => props ?? ({} as never),
    getDropTargetProps: (props) => props ?? ({} as never),
    getInputProps: (props) => props ?? ({} as never),
    isDragActive: false,
    isDragAccept: false,
    isDragReject: false,
    fileRejections: [],
    ...overrides,
  };
}

function uploading(files: UploadFileState[], loaded = 1024) {
  const total = files.reduce((sum, file) => sum + file.fileSize, 0);
  return stubUpload({
    files,
    phase: "uploading",
    isPending: true,
    progress: { loaded, total, percent: Math.round((loaded / total) * 100) },
  });
}

function settled(files: UploadFileState[]) {
  return stubUpload({
    files,
    phase: files.some((file) => file.phase === "error") ? "error" : "success",
  });
}

function renderToasts(upload: UseUploadReturn) {
  const view = render(
    <Toaster>
      <UploadToasts upload={upload} />
    </Toaster>,
  );
  return {
    ...view,
    update: (next: UseUploadReturn) =>
      view.rerender(
        <Toaster>
          <UploadToasts upload={next} />
        </Toaster>,
      ),
  };
}

describe("UploadToasts", () => {
  it("shows progress with a cancel action while files upload", async () => {
    const { update } = renderToasts(uploading([fileState("a", "uploading")]));

    expect(await screen.findByText("Uploading")).toBeDefined();
    expect(screen.getByText("1.0 KB / 2.0 KB")).toBeDefined();

    update(
      uploading([fileState("a", "success"), fileState("b", "uploading")], 3072),
    );
    expect(await screen.findByText("Uploading 1/2")).toBeDefined();
    expect(screen.getByText("3.0 KB / 4.0 KB")).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancel).toHaveBeenCalledWith();
  });

  it("replaces progress with the result once files settle", async () => {
    const { update } = renderToasts(uploading([fileState("a", "uploading")]));
    await screen.findByText("Uploading");

    update(settled([fileState("a", "success")]));

    expect(await screen.findByText("Upload complete")).toBeDefined();
    await waitFor(() => expect(screen.queryByText("Uploading")).toBeNull());
  });

  it("reports a failed file with its localized error", async () => {
    const { update } = renderToasts(uploading([fileState("a", "uploading")]));

    update(settled([fileState("a", "error")]));

    expect(await screen.findByText("Upload failed")).toBeDefined();
    expect(screen.getByText("Network error")).toBeDefined();
  });

  it("summarizes the files of a call", async () => {
    const { update } = renderToasts(
      uploading([fileState("a", "uploading"), fileState("b", "uploading")]),
    );

    update(settled([fileState("a", "success"), fileState("b", "success")]));
    expect(await screen.findByText("2 file(s) uploaded")).toBeDefined();
    expect(screen.getByText("4.0 KB")).toBeDefined();

    update(
      uploading([
        fileState("a", "success"),
        fileState("b", "success"),
        fileState("c", "uploading"),
        fileState("d", "uploading"),
      ]),
    );
    update(
      settled([
        fileState("a", "success"),
        fileState("b", "success"),
        fileState("c", "success"),
        fileState("d", "error"),
      ]),
    );
    expect(
      await screen.findByText("Upload finished with errors"),
    ).toBeDefined();
    expect(screen.getByText("1 succeeded, 1 failed")).toBeDefined();
  });

  it("does not report files that settled before it mounted", async () => {
    const before = settled([fileState("a", "success")]);
    const { update } = renderToasts(before);

    // A later call that only rejects files leaves the queue as it was.
    update(stubUpload({ ...before, phase: "uploading", isPending: true }));
    update(before);
    update(uploading([fileState("a", "success"), fileState("b", "uploading")]));
    update(settled([fileState("a", "success"), fileState("b", "success")]));

    expect(await screen.findByText("Upload complete")).toBeDefined();
    expect(screen.getAllByText("Upload complete")).toHaveLength(1);
  });

  it("reports rejected files with a localized reason", async () => {
    const { update } = renderToasts(stubUpload());
    const one: FileRejection[] = [
      {
        file: new File(["x"], "big.zip"),
        errors: [s3Error("FILE_TOO_LARGE", { size: 4096, maxFileSize: 1024 })],
      },
    ];

    update(stubUpload({ fileRejections: one }));
    expect(await screen.findByText("File not accepted")).toBeDefined();
    expect(
      document.querySelector("[data-slot=toast-description]")?.textContent,
    ).toBe("big.zip: File size exceeds 1.0 KB limit");

    const many: FileRejection[] = ["a", "b", "c"].map((name) => ({
      file: new File(["x"], name),
      errors: [s3Error("TOO_MANY_FILES", { maxFiles: 2 })],
    }));
    update(stubUpload({ fileRejections: many }));
    expect(await screen.findByText("3 files were rejected")).toBeDefined();
    expect(screen.getByText("Too many files (max 2)")).toBeDefined();
  });

  it("shows toasts from one owner per hook and warns about the second", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const upload = stubUpload();
    const { rerender } = render(
      <Toaster>
        <UploadToasts upload={upload} />
        <UploadToasts upload={upload} />
      </Toaster>,
    );
    const rejected = stubUpload({
      fileRejections: [
        { file: new File(["x"], "a.exe"), errors: [s3Error("FILE_EMPTY")] },
      ],
    });

    rerender(
      <Toaster>
        <UploadToasts upload={rejected} />
        <UploadToasts upload={rejected} />
      </Toaster>,
    );

    expect(await screen.findByText("File not accepted")).toBeDefined();
    expect(screen.getAllByText("File not accepted")).toHaveLength(1);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("reports each result once under StrictMode", async () => {
    const view = render(
      <Toaster>
        <UploadToasts upload={uploading([fileState("a", "uploading")])} />
      </Toaster>,
      { reactStrictMode: true },
    );
    await screen.findByText("Uploading");

    view.rerender(
      <Toaster>
        <UploadToasts upload={settled([fileState("a", "success")])} />
      </Toaster>,
    );

    expect(await screen.findByText("Upload complete")).toBeDefined();
    expect(screen.getAllByText("Upload complete")).toHaveLength(1);
    await waitFor(() => expect(screen.queryByText("Uploading")).toBeNull());
  });

  it("closes its progress toast when it unmounts", async () => {
    const upload = uploading([fileState("a", "uploading")]);
    const { rerender } = render(
      <Toaster>
        <UploadToasts upload={upload} />
      </Toaster>,
    );
    await screen.findByText("Uploading");

    rerender(<Toaster>{null}</Toaster>);

    await waitFor(() => expect(screen.queryByText("Uploading")).toBeNull());
  });
});
