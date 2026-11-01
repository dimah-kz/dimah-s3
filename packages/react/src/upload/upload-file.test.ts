import { afterEach, describe, expect, it, vi } from "vitest";
import { S3_MAX_FILE_FIELD_BYTES, s3Error, sha256Blob } from "@dimah-s3/core";
import { uploadBodySchema } from "@dimah-s3/core/schema";
import { fakeS3Api } from "@/test/api";
import type { UploadFileOptions } from "@/types/upload";
import { DEFAULT_MULTIPART_THRESHOLD } from "./constants";
import { uploadMultipart } from "./multipart";
import { uploadFile } from "./upload-file";
import { sendXhrUpload } from "./xhr-upload";

vi.mock("./xhr-upload", () => ({
  sendXhrUpload: vi.fn(async () => {}),
}));

vi.mock("./multipart", () => ({
  uploadMultipart: vi.fn(async () => ({
    key: "uploads/big.bin",
    bucket: "bucket",
    size: DEFAULT_MULTIPART_THRESHOLD,
    metadata: {},
  })),
}));

const single = { multipart: false, checksum: false };

function options(patch: Partial<UploadFileOptions> = {}): UploadFileOptions {
  return { route: "uploads", policy: single, ...patch };
}

function png(size = 4) {
  return new File(["x".repeat(size)], "a.png", { type: "image/png" });
}

function bigFile() {
  const file = new File(["x"], "big.bin", { type: "application/octet-stream" });
  Object.defineProperty(file, "size", { value: DEFAULT_MULTIPART_THRESHOLD });
  return file;
}

const putHeaders = {
  "content-type": "image/png",
  "x-amz-meta-dimah-upload": "id",
};

/** The fake API, presigning PUT uploads instead of POST. */
function putApi() {
  const base = fakeS3Api();
  return fakeS3Api({
    confirm: base.confirm,
    upload: vi.fn(async (payload, requestOptions) => {
      const { key, bucket, expiresIn, ticket } = await base.upload(
        payload,
        requestOptions,
      );
      return {
        key,
        bucket,
        url: "https://s3.test/put",
        expiresIn,
        ticket,
        method: "PUT" as const,
        headers: putHeaders,
      };
    }),
  });
}

describe("uploadFile", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("presigns, posts the form, then confirms with the ticket", async () => {
    const api = fakeS3Api();
    const file = png();
    const phases: string[] = [];
    const onProgress = vi.fn();

    const result = await uploadFile(
      api,
      file,
      options({ onPhaseChange: (phase) => phases.push(phase), onProgress }),
    );

    expect(api.upload).toHaveBeenCalledWith(
      { route: "uploads", name: "a.png", size: 4, type: "image/png" },
      expect.anything(),
    );
    const [{ method, url, body }] = vi.mocked(sendXhrUpload).mock.calls[0];
    expect({ method, url }).toEqual({
      method: "POST",
      url: "https://s3.test/post",
    });
    const form = body as FormData;
    expect([...form.keys()]).toEqual(["key", "Policy", "file"]);
    expect(form.get("file")).toBeInstanceOf(File);
    expect(api.confirm).toHaveBeenCalledWith(
      { ticket: "ticket-1" },
      expect.anything(),
    );
    expect(result).toEqual({
      key: "uploads/a.png",
      bucket: "bucket",
      name: "a.png",
      size: 4,
      type: "image/png",
      eTag: '"etag"',
      metadata: {},
    });
    expect(phases).toEqual([
      "preparing",
      "presigning",
      "uploading",
      "finalizing",
    ]);
    expect(onProgress).toHaveBeenLastCalledWith({
      loaded: 4,
      total: 4,
      percent: 100,
    });
  });

  it("reports upload progress in file bytes", async () => {
    vi.mocked(sendXhrUpload).mockImplementation(async ({ onProgress }) => {
      onProgress?.(0.5);
    });
    const onProgress = vi.fn();

    await uploadFile(fakeS3Api(), png(10), options({ onProgress }));

    expect(onProgress).toHaveBeenCalledWith({
      loaded: 5,
      total: 10,
      percent: 50,
    });
  });

  it("sends request overrides", async () => {
    const api = fakeS3Api();
    await uploadFile(
      api,
      png(),
      options({
        request: {
          fileName: "renamed.png",
          contentType: "image/webp",
          metadata: { folder: "docs" },
        },
      }),
    );

    expect(api.upload).toHaveBeenCalledWith(
      {
        route: "uploads",
        name: "renamed.png",
        size: 4,
        type: "image/webp",
        metadata: { folder: "docs" },
      },
      expect.anything(),
    );
  });

  it("fits a long file name to the wire limit before presign", async () => {
    const api = fakeS3Api();
    const name = `${"文".repeat(100)}.docx`;
    await uploadFile(api, new File(["x"], name), options());

    const [payload] = vi.mocked(api.upload).mock.calls[0] ?? [];
    expect(uploadBodySchema.safeParse(payload).success).toBe(true);
    expect(payload?.name).toMatch(/^文+\.docx$/);
    expect(
      new TextEncoder().encode(payload?.name).byteLength,
    ).toBeLessThanOrEqual(S3_MAX_FILE_FIELD_BYTES);
  });

  it("omits a blank browser content type", async () => {
    const api = fakeS3Api();
    await uploadFile(api, new File(["x"], "a.bin", { type: "" }), options());
    expect(api.upload).toHaveBeenCalledWith(
      { route: "uploads", name: "a.bin", size: 1 },
      expect.anything(),
    );
  });

  it("sends exactly the presigned PUT headers", async () => {
    const api = putApi();
    const file = png();

    await uploadFile(api, file, options());

    expect(sendXhrUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PUT",
        url: "https://s3.test/put",
        body: file,
        headers: putHeaders,
      }),
    );
    expect(api.confirm).toHaveBeenCalledWith(
      { ticket: "ticket-1" },
      expect.anything(),
    );
  });

  it("uses api.uploadTransport instead of the default transfer", async () => {
    const api = putApi();
    const transport = vi.fn(async () => {});
    Object.assign(api, { uploadTransport: transport });
    const file = png();

    await uploadFile(api, file, options());

    expect(transport).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ method: "PUT", headers: putHeaders }),
      expect.objectContaining({ signal: undefined }),
    );
    expect(sendXhrUpload).not.toHaveBeenCalled();
    expect(api.confirm).toHaveBeenCalledOnce();
  });

  it("sends a SHA-256 checksum only when the policy requires one", async () => {
    const api = fakeS3Api();
    const file = png();

    await uploadFile(
      api,
      file,
      options({ policy: { multipart: false, checksum: true } }),
    );
    await uploadFile(api, file, options());

    const [withChecksum, without] = vi.mocked(api.upload).mock.calls;
    expect(withChecksum[0].checksum).toBe(await sha256Blob(file));
    expect(without[0]).not.toHaveProperty("checksum");
  });

  it("retries confirm without presigning again", async () => {
    const api = fakeS3Api();
    vi.mocked(api.confirm).mockRejectedValueOnce(s3Error("NETWORK_ERROR"));

    await uploadFile(api, png(), options({ retry: { baseDelay: 1 } }));

    expect(api.upload).toHaveBeenCalledOnce();
    expect(api.confirm).toHaveBeenCalledTimes(2);
  });

  it("presigns again when S3 rejects an expired URL", async () => {
    const api = fakeS3Api();
    vi.mocked(sendXhrUpload).mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + 600_000);
      throw s3Error("UPLOAD_FAILED", { status: 403 }, { status: 403 });
    });

    await uploadFile(api, png(), options({ retry: { baseDelay: 1 } }));

    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(api.confirm).toHaveBeenCalledWith(
      { ticket: "ticket-2" },
      expect.anything(),
    );
  });

  it("rejects with an APIError, and UNKNOWN_ERROR for other failures", async () => {
    const api = fakeS3Api();
    const cause = new Error("nope");
    vi.mocked(api.upload).mockRejectedValueOnce(cause);

    await expect(uploadFile(api, png(), options())).rejects.toMatchObject({
      code: "UNKNOWN_ERROR",
      cause,
    });

    vi.mocked(api.upload).mockRejectedValueOnce(
      s3Error("FILE_TOO_LARGE", { size: 4, maxFileSize: 1 }),
    );
    await expect(uploadFile(api, png(), options())).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
    });
  });

  it("rejects with the abort reason", async () => {
    const api = fakeS3Api();
    const controller = new AbortController();
    const reason = new DOMException("cancel", "AbortError");
    vi.mocked(sendXhrUpload).mockImplementationOnce(async () => {
      controller.abort(reason);
      throw reason;
    });

    await expect(
      uploadFile(api, png(), options({ signal: controller.signal })),
    ).rejects.toBe(reason);
    expect(api.confirm).not.toHaveBeenCalled();
  });

  it("uses multipart for large files when the policy allows it", async () => {
    const api = fakeS3Api();
    const file = bigFile();

    await expect(
      uploadFile(
        api,
        file,
        options({ policy: { multipart: true, checksum: false } }),
      ),
    ).resolves.toMatchObject({ key: "uploads/big.bin" });

    expect(uploadMultipart).toHaveBeenCalledWith(
      api,
      file,
      {
        route: "uploads",
        name: "big.bin",
        size: DEFAULT_MULTIPART_THRESHOLD,
        type: "application/octet-stream",
      },
      expect.objectContaining({ route: "uploads" }),
      expect.any(Function),
    );
    expect(api.upload).not.toHaveBeenCalled();
  });

  it("uploads large files in one shot when the policy has no multipart", async () => {
    const api = fakeS3Api();

    await uploadFile(api, bigFile(), options());

    expect(uploadMultipart).not.toHaveBeenCalled();
    expect(api.upload).toHaveBeenCalledOnce();
  });
});
