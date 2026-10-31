import { GetObjectCommand } from "@aws-sdk/client-s3";
import { SNIFF_BYTE_LENGTH } from "@dimah-s3/core";
import { describe, expect, it } from "vitest";
import { memoryS3, TEST_BUCKET } from "@/test/harness";
import { assertObjectContent } from "./sniff-object";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
]);
const key = "uploads/a.png";

function check(type: string | undefined, body: Uint8Array | string) {
  const s3 = memoryS3();
  s3.seed(key, body, { contentType: type });
  const result = assertObjectContent(s3.client, {
    bucket: TEST_BUCKET,
    key,
    type,
  });
  return { s3, result };
}

describe("assertObjectContent", () => {
  it("passes when the bytes match the type", async () => {
    const { s3, result } = check("image/png", PNG);
    await expect(result).resolves.toBeUndefined();

    const command = s3.send.mock.calls[0][0] as GetObjectCommand;
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input.Range).toBe(`bytes=0-${SNIFF_BYTE_LENGTH - 1}`);
  });

  it("fails with FILE_CONTENT_MISMATCH and the detected type", async () => {
    const { result } = check("image/jpeg", PNG);
    await expect(result).rejects.toMatchObject({
      code: "FILE_CONTENT_MISMATCH",
      statusCode: 400,
      params: { type: "image/jpeg", detected: "image/png" },
    });
  });

  it("reports unknown content", async () => {
    const { result } = check("image/png", "<html><script>");
    await expect(result).rejects.toMatchObject({
      code: "FILE_CONTENT_MISMATCH",
      params: { type: "image/png", detected: "unknown" },
    });
  });

  it("fails for an empty object with a sniffable type", async () => {
    const { result } = check("image/png", "");
    await expect(result).rejects.toMatchObject({
      code: "FILE_CONTENT_MISMATCH",
    });
  });

  it.each([
    ["a type without a signature", "text/plain"],
    ["no type", undefined],
  ])("passes %s without reading the object", async (_, type) => {
    const { s3, result } = check(type, PNG);
    await expect(result).resolves.toBeUndefined();
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("reads only the first bytes when the provider ignores Range", async () => {
    const s3 = memoryS3();
    let cancelled = false;
    // An endless body: the read must stop on its own.
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => controller.enqueue(PNG),
      pull: (controller) => controller.enqueue(new Uint8Array(1024)),
      cancel: () => {
        cancelled = true;
      },
    });
    s3.send.mockResolvedValueOnce({
      Body: { transformToWebStream: () => stream },
    });

    await expect(
      assertObjectContent(s3.client, {
        bucket: TEST_BUCKET,
        key,
        type: "image/png",
      }),
    ).resolves.toBeUndefined();
    expect(cancelled).toBe(true);
  });

  it("maps a missing object to OBJECT_NOT_FOUND", async () => {
    await expect(
      assertObjectContent(memoryS3().client, {
        bucket: TEST_BUCKET,
        key,
        type: "image/png",
      }),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
  });
});
