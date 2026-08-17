import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadFile } from "./upload-file";
import { uploadMultipart } from "./multipart";
import { uploadPut, uploadSimple } from "./presigned-http";
import { fakeS3Api } from "../test/api";

vi.mock("./presigned-http", () => ({
  uploadSimple: vi.fn(async () => {}),
  uploadPut: vi.fn(async () => {}),
}));

vi.mock("./multipart", () => ({
  uploadMultipart: vi.fn(async () => "etag-mp"),
}));

function file(size = 4) {
  return new File(["x".repeat(size)], "a.png", { type: "image/png" });
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
        "a.png",
        {},
        { onPhaseChange: (p) => phases.push(p) },
      ),
    ).resolves.toEqual({ key: "a.png", eTag: "abc" });

    expect(api.upload).toHaveBeenCalledWith(
      expect.objectContaining({ key: "a.png", fileName: "a.png" }),
    );
    expect(uploadSimple).toHaveBeenCalledOnce();
    expect(uploadPut).not.toHaveBeenCalled();
    expect(api.confirm).toHaveBeenCalledWith({
      key: "a.png",
      bucket: "bucket",
    });
    expect(phases).toEqual(["presigning", "uploading", "finalizing"]);
  });

  it("uses PUT when the presign says so", async () => {
    const api = fakeS3Api();
    vi.mocked(api.upload).mockResolvedValue({
      bucket: "bucket",
      key: "a.png",
      url: "https://s3.test/put",
      expiresIn: 600,
      method: "PUT",
      headers: { "Content-Type": "image/png" },
    });

    await uploadFile(api, file(), "a.png");
    expect(uploadPut).toHaveBeenCalledOnce();
    expect(uploadSimple).not.toHaveBeenCalled();
  });

  it("delegates to multipart above the threshold", async () => {
    const api = fakeS3Api();
    await expect(
      uploadFile(api, file(8), "a.bin", {
        multipart: true,
        multipartThreshold: 4,
      }),
    ).resolves.toEqual({ key: "a.bin", eTag: "etag-mp" });

    expect(uploadMultipart).toHaveBeenCalledOnce();
    expect(api.upload).not.toHaveBeenCalled();
    expect(api.confirm).not.toHaveBeenCalled();
  });

  it("wraps API failures as S3UploadError", async () => {
    const api = fakeS3Api();
    vi.mocked(api.upload).mockRejectedValue(new Error("nope"));

    await expect(
      uploadFile(api, file(), "a.png", { retry: { maxRetries: 0 } }),
    ).rejects.toMatchObject({
      name: "S3UploadError",
      code: "UPLOAD_ERROR",
      message: "nope",
    });
  });
});
