import { describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/store/memory-store";
import { fakeS3Api } from "@/test/api";
import { multipartResumeKey } from "./resume-key";
import { uploadMultipart } from "./multipart";
import { uploadPart } from "./upload-part";

vi.mock("./upload-part", () => ({
  uploadPart: vi.fn(async () => {}),
}));

function file(size: number) {
  return new File(["x".repeat(size)], "a.bin", {
    type: "application/octet-stream",
  });
}

describe("uploadMultipart", () => {
  it("inits, signs each part, then completes", async () => {
    const api = fakeS3Api();
    const result = await uploadMultipart(api, file(8), "videos", 4, 2);

    expect(result).toMatchObject({
      key: "videos/a.bin",
      eTag: "abc",
      contentLength: 1,
    });
    expect(api.multipart.init).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "videos",
        fileSize: 8,
        fileName: "a.bin",
      }),
    );
    expect(api.multipart.signPart).toHaveBeenCalledTimes(2);
    expect(uploadPart).toHaveBeenCalledTimes(2);
    expect(api.multipart.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "videos",
        key: "videos/a.bin",
        uploadId: "up-1",
        parts: [{ partNumber: 1 }, { partNumber: 2 }],
      }),
    );
  });

  it("resumes from the store and skips completed parts", async () => {
    const blob = file(8);
    const resumeKey = multipartResumeKey("videos", blob);
    const store = createMemoryStore();
    await store.set({
      resumeKey,
      uploadId: "up-resume",
      key: "videos/uuid/a.bin",
      fileSize: 8,
    });
    const api = fakeS3Api({
      multipart: {
        listParts: vi.fn(async () => ({
          parts: [{ partNumber: 1, size: 4, eTag: "p1" }],
        })),
      },
    });

    await uploadMultipart(
      api,
      blob,
      "videos",
      4,
      2,
      undefined,
      undefined,
      undefined,
      undefined,
      store,
    );

    expect(api.multipart.init).not.toHaveBeenCalled();
    expect(api.multipart.signPart).toHaveBeenCalledTimes(1);
    expect(api.multipart.signPart).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "videos",
        partNumber: 2,
        uploadId: "up-resume",
      }),
    );
    expect(await store.get(resumeKey, 8)).toBeNull();
  });

  it("aborts when resumability is off and a part fails", async () => {
    vi.mocked(uploadPart).mockRejectedValue(new Error("part failed"));
    const api = fakeS3Api();

    await expect(
      uploadMultipart(
        api,
        file(4),
        "videos",
        4,
        1,
        undefined,
        undefined,
        undefined,
        { maxRetries: 0 },
      ),
    ).rejects.toThrow("part failed");
    await vi.waitFor(() => {
      expect(api.multipart.abort).toHaveBeenCalledWith(
        expect.objectContaining({
          route: "videos",
          key: "videos/a.bin",
          uploadId: "up-1",
        }),
      );
    });
  });
});
