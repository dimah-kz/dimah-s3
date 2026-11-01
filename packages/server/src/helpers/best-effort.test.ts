import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { mockS3 } from "@/test/harness";
import { deleteObjectBestEffort, deleteObjectIfMatch } from "./best-effort";

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

describe("deleteObjectIfMatch", () => {
  const input = { bucket: "bucket", key: "a.png", eTag: '"abc"' };

  it("returns true once the object is deleted", async () => {
    const send = vi.fn(async () => ({}));
    await expect(deleteObjectIfMatch(mockS3(send), input)).resolves.toBe(true);
    expect(deleteInputs(send)).toEqual([
      { Bucket: "bucket", Key: "a.png", IfMatch: '"abc"' },
    ]);
  });

  it("returns false when the key holds another object (412)", async () => {
    const send = vi.fn(async () => {
      throw awsError("PreconditionFailed", 412);
    });
    await expect(deleteObjectIfMatch(mockS3(send), input)).resolves.toBe(false);
  });

  it("throws any other failure", async () => {
    const failure = awsError("InternalError", 500);
    const send = vi.fn(async () => {
      throw failure;
    });
    await expect(deleteObjectIfMatch(mockS3(send), input)).rejects.toBe(
      failure,
    );
  });
});
