import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadFile } from "./upload-file";
import { uploadMultipart } from "./multipart";
import { uploadPut, uploadSimple } from "./presigned-http";
import { DEFAULT_MULTIPART_THRESHOLD } from "./constants";
import { fakeS3Api } from "@/test/api";

vi.mock("./presigned-http", () => ({
  uploadSimple: vi.fn(async () => {}),
  uploadPut: vi.fn(async () => {}),
}));

vi.mock("./multipart", () => ({
  uploadMultipart: vi.fn(async (...args: unknown[]) => {
    const onInit = args[11] as
      ((uploadId: string, key: string) => void) | undefined;
    onInit?.("up-1", "videos/a.bin");
    return {
      key: "videos/a.bin",
      eTag: "etag-mp",
      contentLength: DEFAULT_MULTIPART_THRESHOLD,
    };
  }),
}));

function file(size = 4) {
  return new File(["x".repeat(size)], "a.png", { type: "image/png" });
}

function oversizedFile() {
  const f = new File(["x"], "a.bin", { type: "application/octet-stream" });
  Object.defineProperty(f, "size", { value: DEFAULT_MULTIPART_THRESHOLD });
  return f;
}

describe("uploadFile", () => {
  beforeEach(() => {
    vi.mocked(uploadSimple).mockClear();
    vi.mocked(uploadPut).mockClear();
    vi.mocked(uploadMultipart).mockClear();
  });

  it("presigns POST, uploads the form, then confirms", async () => {
    const api = fakeS3Api();
    const phases: string[] = [];

    await expect(
      uploadFile(
        api,
        file(),
        { route: "uploads" },
        { onPhaseChange: (p) => phases.push(p) },
      ),
    ).resolves.toEqual({ key: "uploads/a.png", eTag: "abc", contentLength: 1 });

    expect(api.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "uploads",
        fileName: "a.png",
        fileSize: 4,
      }),
    );
    expect(uploadSimple).toHaveBeenCalledOnce();
    expect(uploadPut).not.toHaveBeenCalled();
    expect(api.confirm).toHaveBeenCalledWith({
      route: "uploads",
      key: "uploads/a.png",
    });
    expect(phases).toEqual(["presigning", "uploading", "finalizing"]);
  });

  it("omits a blank browser contentType", async () => {
    const api = fakeS3Api();
    const unknown = new File(["x"], "a.bin", { type: "" });
    await uploadFile(api, unknown, { route: "uploads" });
    expect(api.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "uploads",
        fileName: "a.bin",
      }),
    );
    expect(
      vi.mocked(api.upload).mock.calls[0]?.[0]?.contentType,
    ).toBeUndefined();
  });

  it("uses PUT when the presign says so", async () => {
    const api = fakeS3Api();
    vi.mocked(api.upload).mockResolvedValue({
      bucket: "bucket",
      key: "uploads/a.png",
      url: "https://s3.test/put",
      expiresIn: 600,
      method: "PUT",
      headers: { "Content-Type": "image/png" },
    });

    await uploadFile(api, file(), { route: "uploads" });
    expect(uploadPut).toHaveBeenCalledOnce();
    expect(uploadSimple).not.toHaveBeenCalled();
  });

  it("delegates to multipart above the internal threshold", async () => {
    const api = fakeS3Api();
    const big = oversizedFile();
    await expect(
      uploadFile(api, big, { route: "videos", multipart: true }),
    ).resolves.toEqual({
      key: "videos/a.bin",
      eTag: "etag-mp",
      contentLength: DEFAULT_MULTIPART_THRESHOLD,
    });

    expect(uploadMultipart).toHaveBeenCalledOnce();
    expect(api.upload).not.toHaveBeenCalled();
    expect(api.confirm).not.toHaveBeenCalled();
  });

  it("uses api.uploadTransport instead of PUT/POST", async () => {
    const transport = vi.fn(async () => {});
    const api = fakeS3Api();
    Object.assign(api, { uploadTransport: transport });
    vi.mocked(api.upload).mockResolvedValue({
      bucket: "bucket",
      key: "uploads/a.png",
      url: "https://s3.test/put",
      expiresIn: 600,
      method: "PUT",
      headers: { "Content-Type": "image/png" },
    });

    await uploadFile(api, file(), { route: "uploads" });

    expect(transport).toHaveBeenCalledOnce();
    expect(uploadPut).not.toHaveBeenCalled();
    expect(uploadSimple).not.toHaveBeenCalled();
    expect(api.confirm).toHaveBeenCalledWith({
      route: "uploads",
      key: "uploads/a.png",
    });
  });

  it("retries confirm without requesting a new presign", async () => {
    const api = fakeS3Api();
    vi.mocked(api.confirm)
      .mockRejectedValueOnce(new Error("confirm failed"))
      .mockResolvedValueOnce({
        key: "uploads/a.png",
        bucket: "bucket",
        contentLength: 1,
        metadata: {},
        eTag: "abc",
      });

    await uploadFile(api, file(), {
      route: "uploads",
      retry: { maxRetries: 1, baseDelay: 1 },
    });

    expect(api.upload).toHaveBeenCalledOnce();
    expect(api.confirm).toHaveBeenCalledTimes(2);
  });

  it("wraps API failures as S3UploadError", async () => {
    const api = fakeS3Api();
    vi.mocked(api.upload).mockRejectedValue(new Error("nope"));

    await expect(
      uploadFile(api, file(), { route: "uploads", retry: { maxRetries: 0 } }),
    ).rejects.toMatchObject({
      name: "S3UploadError",
      code: "UPLOAD_ERROR",
      message: "nope",
    });
  });
});
