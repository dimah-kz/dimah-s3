import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { mockS3 } from "@/test/harness";
import { deleteObjectBestEffort } from "./best-effort";

function awsError(name: string, httpStatusCode: number) {
  return Object.assign(new Error(name), {
    name,
    $metadata: { httpStatusCode },
  });
}

function deleteInputs(send: ReturnType<typeof vi.fn>) {
  return send.mock.calls.map(([command]) => {
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    return (command as DeleteObjectCommand).input;
  });
}

describe("deleteObjectBestEffort", () => {
  it("sends a plain DeleteObject without an ETag", async () => {
    const send = vi.fn(async () => ({}));
    await deleteObjectBestEffort(mockS3(send), "bucket", "a.png");
    expect(deleteInputs(send)).toEqual([{ Bucket: "bucket", Key: "a.png" }]);
  });

  it("sends If-Match with an ETag", async () => {
    const send = vi.fn(async () => ({}));
    await deleteObjectBestEffort(mockS3(send), "bucket", "a.png", '"abc"');
    expect(deleteInputs(send)).toEqual([
      { Bucket: "bucket", Key: "a.png", IfMatch: '"abc"' },
    ]);
  });

  it("keeps the object when the ETag no longer matches (412)", async () => {
    const send = vi.fn(async () => {
      throw awsError("PreconditionFailed", 412);
    });
    await expect(
      deleteObjectBestEffort(mockS3(send), "bucket", "a.png", '"abc"'),
    ).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledOnce();
  });

  it("falls back to a plain delete when If-Match is not implemented (501)", async () => {
    const send = vi
      .fn(async () => ({}))
      .mockRejectedValueOnce(awsError("NotImplemented", 501));
    await deleteObjectBestEffort(mockS3(send), "bucket", "a.png", '"abc"');
    expect(deleteInputs(send)).toEqual([
      { Bucket: "bucket", Key: "a.png", IfMatch: '"abc"' },
      { Bucket: "bucket", Key: "a.png" },
    ]);
  });

  it("swallows other errors", async () => {
    const send = vi.fn(async () => {
      throw awsError("InternalError", 500);
    });
    await expect(
      deleteObjectBestEffort(mockS3(send), "bucket", "a.png", '"abc"'),
    ).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledOnce();
  });
});
