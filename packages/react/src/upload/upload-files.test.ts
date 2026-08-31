import { describe, expect, it, vi } from "vitest";
import { fakeS3Api } from "@/test/api";
import { uploadFile } from "./upload-file";
import { uploadFiles } from "./upload-files";

vi.mock("./upload-file", () => ({
  uploadFile: vi.fn(async (_api, file: File) => ({
    key: `uploads/${file.name}`,
    eTag: "e",
    contentLength: 1,
  })),
}));

function item(id: string) {
  return {
    id,
    file: new File(["x"], `${id}.txt`, { type: "text/plain" }),
  };
}

describe("uploadFiles", () => {
  it("uploads each item and reports success", async () => {
    const api = fakeS3Api();
    const onFileSuccess = vi.fn();

    const results = await uploadFiles(
      api,
      [item("a"), item("b")],
      { route: "uploads", concurrentFiles: 2 },
      { onFileSuccess },
    );

    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r.status)).toEqual(["success", "success"]);
    expect(onFileSuccess).toHaveBeenCalledTimes(2);
  });

  it("records per-file errors without failing the batch", async () => {
    vi.mocked(uploadFile)
      .mockResolvedValueOnce({
        key: "uploads/a.txt",
        eTag: "e",
        contentLength: 1,
      })
      .mockRejectedValueOnce(new Error("boom"));

    const results = await uploadFiles(fakeS3Api(), [item("a"), item("b")], {
      route: "uploads",
    });

    expect(results[0]?.status).toBe("success");
    expect(results[1]?.status).toBe("error");
    expect(results[1]?.error?.message).toBe("boom");
  });

  it("rethrows AbortError so the caller can treat the batch as cancelled", async () => {
    vi.mocked(uploadFile).mockRejectedValueOnce(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    );

    await expect(
      uploadFiles(fakeS3Api(), [item("a")], { route: "uploads" }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
