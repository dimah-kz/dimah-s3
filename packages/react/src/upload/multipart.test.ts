import { describe, expect, it, vi } from "vitest";
import {
  S3_DEFAULT_PART_SIZE,
  s3Error,
  sha256Blob,
  type MultipartInitPayload,
  type S3Api,
} from "@dimah-s3/core";
import { abortable } from "@/internal/abortable";
import { createMemoryStore } from "@/store/memory-store";
import { fakeS3Api } from "@/test/api";
import type { UploadFileOptions } from "@/types/upload";
import type { StoredUpload, UploadStore } from "@/types/upload-store";
import { uploadAbortReason } from "./abort";
import { uploadMultipart } from "./multipart";
import { multipartResumeKey } from "./resume-key";
import { uploadPart } from "./upload-part";

vi.mock("./upload-part", () => ({
  uploadPart: vi.fn(async () => {}),
}));

const MiB = 1024 * 1024;
const noRetry = { maxRetries: 0 };

function bigFile(size = S3_DEFAULT_PART_SIZE + 2 * MiB) {
  return new File([new Uint8Array(size)], "a.bin", {
    type: "application/octet-stream",
    lastModified: 1,
  });
}

function payload(file: File): MultipartInitPayload {
  return { route: "videos", name: file.name, size: file.size };
}

function run(api: S3Api, file: File, options: Partial<UploadFileOptions> = {}) {
  return uploadMultipart(
    api,
    file,
    payload(file),
    {
      route: "videos",
      policy: { multipart: true, checksum: false },
      ...options,
    },
    () => {},
  );
}

/** The fake API, with an `init` that requires part checksums. */
function checksumApi(): S3Api {
  const base = fakeS3Api();
  return fakeS3Api({
    multipart: {
      ...base.multipart,
      init: vi.fn(async (body, options) => ({
        ...(await base.multipart.init(body, options)),
        checksum: true,
      })),
    },
  });
}

function sentPartSizes() {
  return vi
    .mocked(uploadPart)
    .mock.calls.map(([part]) => part.size)
    .toSorted((a, b) => b - a);
}

describe("uploadMultipart", () => {
  it("follows the server layout and completes with the ticket only", async () => {
    const api = fakeS3Api();
    const file = bigFile();
    const phases: string[] = [];
    const onMultipartInit = vi.fn();

    const result = await uploadMultipart(
      api,
      file,
      payload(file),
      {
        route: "videos",
        policy: { multipart: true, checksum: false },
        onMultipartInit,
      },
      (phase) => phases.push(phase),
    );

    expect(api.multipart.init).toHaveBeenCalledWith(
      { route: "videos", name: "a.bin", size: file.size },
      expect.anything(),
    );
    expect(onMultipartInit).toHaveBeenCalledWith({
      uploadId: "upload-1",
      key: "videos/a.bin",
    });
    expect(sentPartSizes()).toEqual([S3_DEFAULT_PART_SIZE, 2 * MiB]);
    expect(api.multipart.signPart).toHaveBeenCalledTimes(2);
    expect(api.multipart.complete).toHaveBeenCalledWith(
      { ticket: "ticket-1" },
      expect.anything(),
    );
    expect(api.multipart.listParts).not.toHaveBeenCalled();
    expect(result).toMatchObject({ key: "videos/a.bin", size: file.size });
    expect(result).not.toHaveProperty("uploadId");
    expect(phases).toEqual([
      "preparing",
      "presigning",
      "uploading",
      "finalizing",
    ]);
  });

  it("reports progress and each finished part", async () => {
    const api = fakeS3Api();
    const file = bigFile();
    const onProgress = vi.fn();
    const onPartUpload = vi.fn();

    await run(api, file, { onProgress, onPartUpload, concurrentParts: 1 });

    expect(onPartUpload.mock.calls).toEqual([
      [{ partNumber: 1, totalParts: 2 }],
      [{ partNumber: 2, totalParts: 2 }],
    ]);
    expect(onProgress).toHaveBeenLastCalledWith({
      loaded: file.size,
      total: file.size,
      percent: 100,
    });
  });

  it("runs at most concurrentParts parts at once", async () => {
    const api = fakeS3Api();
    const file = bigFile(4 * S3_DEFAULT_PART_SIZE);
    let running = 0;
    let peak = 0;
    vi.mocked(uploadPart).mockImplementation(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
    });

    await run(api, file, { concurrentParts: 2 });

    expect(uploadPart).toHaveBeenCalledTimes(4);
    expect(peak).toBe(2);
  });

  it("hashes each part as a stream and signs it with the checksum", async () => {
    const api = checksumApi();
    const file = bigFile();
    const arrayBuffer = vi.spyOn(Blob.prototype, "arrayBuffer");

    await run(api, file);

    const read = arrayBuffer.mock.contexts.map((blob) =>
      blob instanceof Blob ? blob.size : Infinity,
    );
    expect(read.length).toBeGreaterThan(2);
    expect(Math.max(...read)).toBeLessThanOrEqual(MiB);
    arrayBuffer.mockRestore();

    const lastPart = file.slice(S3_DEFAULT_PART_SIZE);
    expect(api.multipart.signPart).toHaveBeenCalledWith(
      {
        ticket: "ticket-1",
        partNumber: 2,
        checksum: await sha256Blob(lastPart),
      },
      expect.anything(),
    );
  });

  it("sends no part checksum when the init response does not ask for one", async () => {
    const api = fakeS3Api();
    await run(api, bigFile());
    expect(api.multipart.signPart).toHaveBeenCalledWith(
      { ticket: "ticket-1", partNumber: 1 },
      expect.anything(),
    );
  });

  it("stores the session and deletes it once complete", async () => {
    const api = fakeS3Api();
    const file = bigFile();
    const store = createMemoryStore();
    const set = vi.spyOn(store, "set");

    await run(api, file, { uploadStore: store });

    expect(set).toHaveBeenCalledWith({
      resumeKey: multipartResumeKey("videos", file),
      ticket: "ticket-1",
      key: "videos/a.bin",
      uploadId: "upload-1",
      fileSize: file.size,
      partSize: S3_DEFAULT_PART_SIZE,
      partCount: 2,
      checksum: false,
    });
    expect(
      await store.get(multipartResumeKey("videos", file), file.size),
    ).toBeNull();
  });

  it("resumes a stored session and sends only the missing parts", async () => {
    const api = fakeS3Api();
    const file = bigFile();
    const store = createMemoryStore();
    vi.mocked(uploadPart)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(s3Error("NETWORK_ERROR"));

    await expect(
      run(api, file, {
        uploadStore: store,
        concurrentParts: 1,
        retry: noRetry,
      }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(api.multipart.abort).not.toHaveBeenCalled();

    vi.mocked(api.multipart.listParts).mockResolvedValueOnce({
      parts: [{ partNumber: 1, size: S3_DEFAULT_PART_SIZE, eTag: '"p1"' }],
    });
    vi.mocked(api.multipart.signPart).mockClear();
    const onMultipartInit = vi.fn();

    await run(api, file, { uploadStore: store, onMultipartInit });

    expect(api.multipart.init).toHaveBeenCalledOnce();
    expect(api.multipart.listParts).toHaveBeenCalledWith(
      { ticket: "ticket-1" },
      expect.anything(),
    );
    expect(api.multipart.signPart).toHaveBeenCalledExactlyOnceWith(
      { ticket: "ticket-1", partNumber: 2 },
      expect.anything(),
    );
    expect(onMultipartInit).toHaveBeenCalledWith({
      uploadId: "upload-1",
      key: "videos/a.bin",
    });
    expect(
      await store.get(multipartResumeKey("videos", file), file.size),
    ).toBeNull();
  });

  it("sends a listed part again when its size does not match the layout", async () => {
    const api = fakeS3Api();
    const file = bigFile();
    const store = createMemoryStore();
    vi.mocked(uploadPart).mockRejectedValueOnce(s3Error("NETWORK_ERROR"));
    await expect(
      run(api, file, {
        uploadStore: store,
        concurrentParts: 1,
        retry: noRetry,
      }),
    ).rejects.toThrow();

    vi.mocked(api.multipart.listParts).mockResolvedValueOnce({
      parts: [{ partNumber: 1, size: 1, eTag: '"p1"' }],
    });
    vi.mocked(api.multipart.signPart).mockClear();
    await run(api, file, { uploadStore: store });

    expect(api.multipart.signPart).toHaveBeenCalledTimes(2);
  });

  it.each([
    "UPLOAD_TICKET_EXPIRED",
    "UPLOAD_TICKET_INVALID",
    "OBJECT_NOT_FOUND",
  ] as const)("aborts and starts fresh when resuming hits %s", async (code) => {
    const api = fakeS3Api();
    const file = bigFile();
    const store = createMemoryStore();
    await store.set(storedUpload(file, { ticket: "stale" }));
    vi.mocked(api.multipart.listParts).mockRejectedValueOnce(s3Error(code));

    await run(api, file, { uploadStore: store });

    expect(api.multipart.abort).toHaveBeenCalledWith({ ticket: "stale" });
    expect(api.multipart.init).toHaveBeenCalledOnce();
    expect(api.multipart.complete).toHaveBeenCalledWith(
      { ticket: "ticket-1" },
      expect.anything(),
    );
  });

  it("keeps a stored session when listParts fails with a network error", async () => {
    const api = fakeS3Api();
    const file = bigFile();
    const store = createMemoryStore();
    await store.set(storedUpload(file, { ticket: "kept" }));
    vi.mocked(api.multipart.listParts).mockRejectedValue(
      s3Error("NETWORK_ERROR"),
    );

    await expect(
      run(api, file, { uploadStore: store, retry: noRetry }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });

    expect(api.multipart.init).not.toHaveBeenCalled();
    expect(api.multipart.abort).not.toHaveBeenCalled();
    expect(
      await store.get(multipartResumeKey("videos", file), file.size),
    ).toMatchObject({
      ticket: "kept",
    });
  });

  it("aborts and deletes a stored session when listParts fails for good", async () => {
    const api = fakeS3Api();
    const file = bigFile();
    const store = createMemoryStore();
    await store.set(storedUpload(file, { ticket: "denied" }));
    vi.mocked(api.multipart.listParts).mockRejectedValue(s3Error("FORBIDDEN"));

    await expect(run(api, file, { uploadStore: store })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    expect(api.multipart.init).not.toHaveBeenCalled();
    expect(api.multipart.abort).toHaveBeenCalledWith({ ticket: "denied" });
    expect(
      await store.get(multipartResumeKey("videos", file), file.size),
    ).toBeNull();
  });

  it("aborts and deletes a stored session when cancelled while resuming", async () => {
    const api = fakeS3Api();
    const file = bigFile();
    const store = createMemoryStore();
    await store.set(storedUpload(file, { ticket: "resuming" }));
    const listing = Promise.withResolvers<void>();
    vi.mocked(api.multipart.listParts).mockImplementation((_body, options) => {
      listing.resolve();
      return abortable(new Promise<never>(() => {}), options?.signal);
    });
    const controller = new AbortController();
    const upload = run(api, file, {
      uploadStore: store,
      signal: controller.signal,
    });
    await listing.promise;

    const reason = uploadAbortReason("cancel");
    controller.abort(reason);

    await expect(upload).rejects.toBe(reason);
    expect(api.multipart.abort).toHaveBeenCalledWith({ ticket: "resuming" });
    expect(
      await store.get(multipartResumeKey("videos", file), file.size),
    ).toBeNull();
  });

  it("keeps a stored session when detached while resuming", async () => {
    const api = fakeS3Api();
    const file = bigFile();
    const store = createMemoryStore();
    await store.set(storedUpload(file, { ticket: "resuming" }));
    const controller = new AbortController();
    controller.abort(uploadAbortReason("detach"));

    await expect(
      run(api, file, { uploadStore: store, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(api.multipart.abort).not.toHaveBeenCalled();
    expect(
      await store.get(multipartResumeKey("videos", file), file.size),
    ).toMatchObject({ ticket: "resuming" });
  });

  it("does not resume a session stored for other request options", async () => {
    const api = fakeS3Api();
    const file = bigFile();
    const store = createMemoryStore();
    const inFolder = (folder: string) => ({ metadata: { folder } });
    vi.mocked(uploadPart).mockRejectedValueOnce(s3Error("NETWORK_ERROR"));
    await expect(
      run(api, file, {
        uploadStore: store,
        request: inFolder("a"),
        concurrentParts: 1,
        retry: noRetry,
      }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });

    await run(api, file, { uploadStore: store, request: inFolder("b") });

    expect(api.multipart.listParts).not.toHaveBeenCalled();
    expect(api.multipart.init).toHaveBeenCalledTimes(2);
    expect(api.multipart.complete).toHaveBeenCalledExactlyOnceWith(
      { ticket: "ticket-2" },
      expect.anything(),
    );
    const keyA = multipartResumeKey("videos", file, inFolder("a"));
    expect(await store.get(keyA, file.size)).toMatchObject({
      ticket: "ticket-1",
    });
  });

  it("does not share a session between concurrent uploads of one file", async () => {
    const api = fakeS3Api();
    const file = bigFile();
    const store = createMemoryStore();
    const set = vi.spyOn(store, "set");
    const started = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    vi.mocked(uploadPart).mockImplementationOnce(() => {
      started.resolve();
      return gate.promise;
    });
    const first = run(api, file, { uploadStore: store, concurrentParts: 1 });
    await started.promise;

    await run(api, file, { uploadStore: store });

    expect(api.multipart.listParts).not.toHaveBeenCalled();
    expect(api.multipart.init).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenCalledOnce();
    const resumeKey = multipartResumeKey("videos", file);
    expect(await store.get(resumeKey, file.size)).toMatchObject({
      ticket: "ticket-1",
    });

    gate.resolve();
    await first;
    expect(await store.get(resumeKey, file.size)).toBeNull();
  });

  it("ignores and deletes a stored record with a 1.x shape", async () => {
    const api = fakeS3Api();
    const file = bigFile();
    const resumeKey = multipartResumeKey("videos", file);
    const legacy = {
      resumeKey,
      uploadId: "old",
      key: "videos/a.bin",
      fileSize: file.size,
    };
    const store: UploadStore = {
      get: vi.fn(() => legacy as unknown as StoredUpload),
      set: vi.fn(),
      delete: vi.fn(),
    };

    await run(api, file, { uploadStore: store });

    expect(store.delete).toHaveBeenCalledWith(resumeKey);
    expect(api.multipart.listParts).not.toHaveBeenCalled();
    expect(api.multipart.init).toHaveBeenCalledOnce();
  });

  it("aborts the server upload when a part fails and no store is set", async () => {
    const api = fakeS3Api();
    vi.mocked(uploadPart).mockRejectedValue(
      s3Error("UPLOAD_FAILED", { status: 400 }, { status: 400 }),
    );

    await expect(run(api, bigFile(), { retry: noRetry })).rejects.toMatchObject(
      {
        code: "UPLOAD_FAILED",
      },
    );
    expect(api.multipart.abort).toHaveBeenCalledWith({ ticket: "ticket-1" });
  });

  it.each([
    [
      "UPLOAD_FAILED 400",
      s3Error("UPLOAD_FAILED", { status: 400 }, { status: 400 }),
    ],
    ["CHECKSUM_MISMATCH", s3Error("CHECKSUM_MISMATCH")],
    ["FORBIDDEN", s3Error("FORBIDDEN")],
  ])(
    "aborts and deletes a stored session when a part fails with %s",
    async (_label, failure) => {
      const api = fakeS3Api();
      const file = bigFile();
      const store = createMemoryStore();
      vi.mocked(uploadPart).mockRejectedValue(failure);

      await expect(
        run(api, file, { uploadStore: store, retry: noRetry }),
      ).rejects.toBe(failure);

      expect(api.multipart.abort).toHaveBeenCalledWith({ ticket: "ticket-1" });
      expect(
        await store.get(multipartResumeKey("videos", file), file.size),
      ).toBeNull();
    },
  );

  it("keeps a stored session when a part fails with a network error", async () => {
    const api = fakeS3Api();
    const file = bigFile();
    const store = createMemoryStore();
    vi.mocked(uploadPart).mockRejectedValue(s3Error("NETWORK_ERROR"));

    await expect(
      run(api, file, { uploadStore: store, retry: noRetry }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });

    expect(api.multipart.abort).not.toHaveBeenCalled();
    expect(
      await store.get(multipartResumeKey("videos", file), file.size),
    ).toMatchObject({ ticket: "ticket-1" });
  });

  it("aborts and deletes a stored session when complete fails for good", async () => {
    const api = fakeS3Api();
    const file = bigFile();
    const store = createMemoryStore();
    vi.mocked(api.multipart.complete).mockRejectedValue(
      s3Error("UPLOAD_TICKET_EXPIRED"),
    );

    await expect(
      run(api, file, { uploadStore: store, retry: noRetry }),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_EXPIRED" });

    expect(api.multipart.abort).toHaveBeenCalledWith({ ticket: "ticket-1" });
    expect(
      await store.get(multipartResumeKey("videos", file), file.size),
    ).toBeNull();
  });

  it("stops the other running parts after a part fails", async () => {
    const api = fakeS3Api();
    const signals: AbortSignal[] = [];
    vi.mocked(uploadPart).mockImplementation(
      async (part, _signed, { signal }) => {
        if (signal) signals.push(signal);
        if (part.size !== S3_DEFAULT_PART_SIZE) {
          throw s3Error("UPLOAD_FAILED", { status: 400 }, { status: 400 });
        }
        await abortable(new Promise<never>(() => {}), signal);
      },
    );

    await expect(
      run(api, bigFile(), { concurrentParts: 2, retry: noRetry }),
    ).rejects.toMatchObject({ code: "UPLOAD_FAILED" });
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});

describe("multipartResumeKey", () => {
  const file = bigFile();

  it("is route, name, size and mtime without request options", () => {
    const key = `videos:a.bin:${file.size}:1`;
    expect(multipartResumeKey("videos", file)).toBe(key);
    expect(multipartResumeKey("videos", file, { metadata: {} })).toBe(key);
  });

  it("depends on the request options but not on metadata order", () => {
    const key = multipartResumeKey("videos", file, {
      metadata: { a: "1", b: "2" },
    });

    expect(
      multipartResumeKey("videos", file, { metadata: { b: "2", a: "1" } }),
    ).toBe(key);
    expect(
      multipartResumeKey("videos", file, { metadata: { a: "1", b: "3" } }),
    ).not.toBe(key);
    expect(multipartResumeKey("videos", file, { fileName: "b.bin" })).not.toBe(
      multipartResumeKey("videos", file, { contentType: "b.bin" }),
    );
  });
});

function storedUpload(file: File, patch: Partial<StoredUpload>): StoredUpload {
  return {
    resumeKey: multipartResumeKey("videos", file),
    ticket: "ticket-0",
    key: "videos/a.bin",
    uploadId: "upload-0",
    fileSize: file.size,
    partSize: S3_DEFAULT_PART_SIZE,
    partCount: 2,
    checksum: false,
    ...patch,
  };
}
