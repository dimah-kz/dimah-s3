import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { s3Error } from "@dimah-s3/core";
import type {
  UploadFilePhase,
  UploadFileState,
  UseUploadReturn,
} from "@dimah-s3/react";
import { render, screen, within } from "@/test/render";
import { Upload } from "@/components/dimah-s3/upload/upload";
import { UploadStatus } from "@/components/dimah-s3/upload/upload-status";
import { UploadTrigger } from "@/components/dimah-s3/upload/upload-trigger";
import {
  UploadFileItem,
  UploadFileList,
} from "@/components/dimah-s3/upload/upload-file-list";

function fileState(
  id: string,
  phase: UploadFilePhase,
  overrides: Partial<UploadFileState> = {},
): UploadFileState {
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
    error: null,
    result: null,
    ...overrides,
  };
}

/** A `useUpload` return in a fixed state. Only the fields parts read matter. */
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
    cancel: vi.fn(),
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

function renderStatus(upload: UseUploadReturn) {
  return render(
    <Upload upload={upload}>
      <UploadStatus />
    </Upload>,
  );
}

describe("UploadStatus", () => {
  it("renders nothing while idle", () => {
    const { container } = renderStatus(stubUpload());

    expect(container.querySelector("[data-slot=upload-status]")).toBeNull();
  });

  it("shows preparing before any file is queued", () => {
    renderStatus(stubUpload({ phase: "uploading", isPending: true }));

    expect(screen.getByText("Preparing…")).toBeDefined();
  });

  it("shows one file as its own card with cancel, and pause when resumable", async () => {
    const file = fileState("a", "uploading", {
      progress: { loaded: 1024, total: 2048, percent: 50 },
    });
    const upload = stubUpload({
      files: [file],
      phase: "uploading",
      isPending: true,
      resumable: true,
    });
    renderStatus(upload);

    expect(
      screen
        .getByRole("progressbar", { name: "Progress for a.txt" })
        .getAttribute("aria-valuenow"),
    ).toBe("50");
    await userEvent.click(screen.getByRole("button", { name: "Cancel a.txt" }));
    expect(upload.cancel).toHaveBeenCalledWith("a");
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(upload.detach).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /Dismiss/ })).toBeNull();
  });

  it("lays out files as a grid under the summary, also for one file", async () => {
    const upload = stubUpload({
      files: [fileState("a", "success")],
      phase: "success",
    });
    const { container } = render(
      <Upload upload={upload}>
        <UploadStatus layout="grid" />
      </Upload>,
    );

    const list = container.querySelector("[data-slot=upload-file-list]");
    expect(list?.getAttribute("data-layout")).toBe("grid");
    expect(screen.getByText("Upload complete")).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(upload.reset).toHaveBeenCalledOnce();
  });

  it("sets data-phase to the hook's phase", () => {
    const { container } = renderStatus(
      stubUpload({ phase: "uploading", isPending: true }),
    );

    expect(
      container
        .querySelector("[data-slot=upload-status]")
        ?.getAttribute("data-phase"),
    ).toBe("uploading");
  });

  it("dismisses a settled single file with reset", async () => {
    const upload = stubUpload({
      files: [fileState("a", "error", { error: s3Error("NETWORK_ERROR") })],
      phase: "error",
    });
    renderStatus(upload);

    expect(screen.getByText("Network error")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss a.txt" }),
    );
    expect(upload.reset).toHaveBeenCalledOnce();
  });

  it("summarizes several files in flight above the list", async () => {
    const upload = stubUpload({
      files: [
        fileState("a", "success"),
        fileState("b", "uploading"),
        fileState("c", "queued"),
      ],
      phase: "uploading",
      isPending: true,
      progress: { loaded: 3072, total: 6144, percent: 50 },
    });
    renderStatus(upload);

    expect(screen.getByText("1/3 files")).toBeDefined();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel all uploads" }),
    );
    expect(upload.cancel).toHaveBeenCalledWith();
  });

  it("cancels one queued file on its own", async () => {
    const upload = stubUpload({
      files: [
        fileState("a", "uploading"),
        fileState("b", "uploading"),
        fileState("c", "queued"),
      ],
      phase: "uploading",
      isPending: true,
    });
    renderStatus(upload);

    await userEvent.click(screen.getByRole("button", { name: "Cancel c.txt" }));
    expect(upload.cancel).toHaveBeenCalledExactlyOnceWith("c");
  });

  it("shows the result of several files with a dismiss action", async () => {
    const upload = stubUpload({
      files: [fileState("a", "success"), fileState("b", "success")],
      phase: "success",
    });
    const { rerender } = renderStatus(upload);

    expect(screen.getByText("All 2 files uploaded")).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(upload.reset).toHaveBeenCalledOnce();

    rerender(
      <Upload
        upload={stubUpload({
          files: [
            fileState("a", "success"),
            fileState("b", "error", { error: s3Error("NETWORK_ERROR") }),
          ],
          phase: "error",
          error: s3Error("PARTIAL_FAILURE", { failed: 1, total: 2 }),
        })}
      >
        <UploadStatus />
      </Upload>,
    );
    expect(screen.getByText("Upload failed")).toBeDefined();
    expect(screen.getByText("1 of 2 failed")).toBeDefined();
  });
});

describe("UploadStatus focus", () => {
  /** A queue whose `cancel` and `reset` drop files like the hook does. */
  function Queue({ initial }: { initial: UploadFileState[] }) {
    const [files, setFiles] = useState(initial);
    const pending = files.some((file) => file.phase === "uploading");
    const upload = stubUpload({
      files,
      phase: files.length === 0 ? "idle" : pending ? "uploading" : "success",
      isPending: pending,
      cancel: (id) =>
        setFiles((current) =>
          id == null ? [] : current.filter((file) => file.id !== id),
        ),
      reset: () => setFiles([]),
    });
    return (
      <Upload upload={upload}>
        <UploadTrigger />
        <UploadStatus />
      </Upload>
    );
  }

  it("moves to the next card when a cancelled file leaves the list", async () => {
    render(
      <Queue
        initial={[
          fileState("a", "uploading"),
          fileState("b", "uploading"),
          fileState("c", "uploading"),
        ]}
      />,
    );

    screen.getByRole("button", { name: "Cancel b.txt" }).focus();
    await userEvent.keyboard("{Enter}");

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cancel c.txt" }),
    );
  });

  it("moves to the trigger when a dismiss empties the status", async () => {
    render(<Queue initial={[fileState("a", "success")]} />);

    screen.getByRole("button", { name: "Dismiss a.txt" }).focus();
    await userEvent.keyboard("{Enter}");

    expect(screen.queryByRole("button", { name: "Dismiss a.txt" })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Upload files" }),
    );
  });
});

describe("UploadFileList", () => {
  it("renders nothing for an empty queue", () => {
    render(
      <Upload upload={stubUpload()}>
        <UploadFileList />
      </Upload>,
    );

    expect(screen.queryByRole("list")).toBeNull();
  });

  it("lists every file with its phase", () => {
    render(
      <Upload
        upload={stubUpload({
          files: [
            fileState("a", "presigning"),
            fileState("b", "finalizing"),
            fileState("c", "success"),
          ],
          phase: "uploading",
          isPending: true,
        })}
      >
        <UploadFileList aria-label="Uploads" />
      </Upload>,
    );

    const items = within(
      screen.getByRole("list", { name: "Uploads" }),
    ).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText("Preparing…")).toBeDefined();
    expect(
      within(items[0]).getByRole("button", { name: "Cancel a.txt" }),
    ).toBeDefined();
    expect(within(items[1]).getByText("Finishing…")).toBeDefined();
    expect(within(items[2]).getByText("2.0 KB")).toBeDefined();
    expect(within(items[2]).queryByRole("button")).toBeNull();
  });

  it("renders custom items", () => {
    render(
      <Upload upload={stubUpload({ files: [fileState("a", "queued")] })}>
        <UploadFileList>
          {(file) => <UploadFileItem file={file} description="Waiting" />}
        </UploadFileList>
      </Upload>,
    );

    expect(screen.getByText("Waiting")).toBeDefined();
  });
});
