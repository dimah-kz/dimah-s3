import { describe, expect, it, vi } from "vitest";
import { S3_DEFAULT_PART_SIZE } from "@dimah-s3/core";
import { abortable } from "@/internal/abortable";
import { createMemoryStore } from "@/store/memory-store";
import { fakeS3Api } from "@/test/api";
import type { UploadStore } from "@/types/upload-store";
import { getUploadAbortKind, uploadAbortReason } from "./abort";
import { uploadMultipart } from "./multipart";
import { multipartResumeKey } from "./resume-key";
import { uploadPart } from "./upload-part";

vi.mock("./upload-part", () => ({
  uploadPart: vi.fn(async () => {}),
}));

describe("uploadAbortReason / getUploadAbortKind", () => {
  it.each(["cancel", "detach"] as const)("round-trips %s", (kind) => {
    const reason = uploadAbortReason(kind);
    expect(reason).toBeInstanceOf(DOMException);
    expect(reason.name).toBe("AbortError");
    expect(getUploadAbortKind(reason)).toBe(kind);
  });

  it("returns null for other abort reasons", () => {
    expect(
      getUploadAbortKind(new DOMException("other", "AbortError")),
    ).toBeNull();
    expect(
      getUploadAbortKind(new DOMException("cancel", "TimeoutError")),
    ).toBeNull();
    expect(getUploadAbortKind(new Error("cancel"))).toBeNull();
    expect(getUploadAbortKind(undefined)).toBeNull();
  });
});

describe("aborting a multipart upload", () => {
  const file = new File([new Uint8Array(S3_DEFAULT_PART_SIZE + 1)], "a.bin", {
    lastModified: 1,
  });
  const resumeKey = multipartResumeKey("videos", file);

  /** Starts an upload whose parts hang until the signal aborts. */
  async function startHanging(store?: UploadStore) {
    const api = fakeS3Api();
    const controller = new AbortController();
    const started = Promise.withResolvers<void>();
    vi.mocked(uploadPart).mockImplementation((_part, _signed, { signal }) => {
      started.resolve();
      return abortable(new Promise<never>(() => {}), signal);
    });
    const upload = uploadMultipart(
      api,
      file,
      { route: "videos", name: file.name, size: file.size },
      {
        route: "videos",
        policy: { multipart: true, checksum: false },
        uploadStore: store,
        signal: controller.signal,
      },
      () => {},
    );
    await started.promise;
    return { api, controller, upload };
  }

  it("cancel rejects with its reason, aborts the upload and deletes the record", async () => {
    const store = createMemoryStore();
    const { api, controller, upload } = await startHanging(store);
    expect(await store.get(resumeKey, file.size)).not.toBeNull();

    const reason = uploadAbortReason("cancel");
    controller.abort(reason);

    await expect(upload).rejects.toBe(reason);
    expect(api.multipart.abort).toHaveBeenCalledWith({ ticket: "ticket-1" });
    expect(await store.get(resumeKey, file.size)).toBeNull();
  });

  it("detach keeps the server upload and the record", async () => {
    const store = createMemoryStore();
    const { api, controller, upload } = await startHanging(store);

    const reason = uploadAbortReason("detach");
    controller.abort(reason);

    await expect(upload).rejects.toBe(reason);
    expect(api.multipart.abort).not.toHaveBeenCalled();
    expect(await store.get(resumeKey, file.size)).toMatchObject({
      ticket: "ticket-1",
    });
  });

  it("detach without a store aborts the upload, since it cannot resume", async () => {
    const { api, controller, upload } = await startHanging();

    controller.abort(uploadAbortReason("detach"));

    await expect(upload).rejects.toMatchObject({ name: "AbortError" });
    expect(api.multipart.abort).toHaveBeenCalledWith({ ticket: "ticket-1" });
  });

  it("treats an abort without a kind as a cancel", async () => {
    const store = createMemoryStore();
    const { api, controller, upload } = await startHanging(store);

    controller.abort();

    await expect(upload).rejects.toMatchObject({ name: "AbortError" });
    expect(api.multipart.abort).toHaveBeenCalledWith({ ticket: "ticket-1" });
    expect(await store.get(resumeKey, file.size)).toBeNull();
  });

  it("ignores a failing abort request", async () => {
    const { api, controller, upload } = await startHanging();
    vi.mocked(api.multipart.abort).mockRejectedValue(new Error("offline"));

    const reason = uploadAbortReason("cancel");
    controller.abort(reason);

    await expect(upload).rejects.toBe(reason);
  });
});
