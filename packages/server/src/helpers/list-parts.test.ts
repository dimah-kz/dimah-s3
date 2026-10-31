import type { ListPartsCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { memoryS3, mockS3, TEST_BUCKET } from "@/test/harness";
import { listAllParts } from "./list-parts";

const target = { bucket: TEST_BUCKET, key: "uploads/a.bin", uploadId: "up-1" };

describe("listAllParts", () => {
  it("reads every page, 1000 parts at a time", async () => {
    const s3 = memoryS3();
    const parts = new Map(
      Array.from({ length: 2001 }, (_, index) => [
        index + 1,
        {
          body: new Uint8Array(1),
          eTag: `"p${index + 1}"`,
          lastModified: new Date(),
        },
      ]),
    );
    s3.uploads.set("up-1", {
      bucket: TEST_BUCKET,
      key: target.key,
      fields: { metadata: {} },
      parts,
    });

    const listed = await listAllParts(s3.client, target);
    expect(listed.map((part) => part.PartNumber)).toEqual(
      Array.from({ length: 2001 }, (_, index) => index + 1),
    );
    const inputs = s3.send.mock.calls.map(
      ([command]) => (command as ListPartsCommand).input,
    );
    expect(inputs).toEqual([
      expect.objectContaining({ MaxParts: 1000, PartNumberMarker: undefined }),
      expect.objectContaining({ MaxParts: 1000, PartNumberMarker: "1000" }),
      expect.objectContaining({ MaxParts: 1000, PartNumberMarker: "2000" }),
    ]);
  });

  it("maps a missing upload to OBJECT_NOT_FOUND", async () => {
    const s3 = memoryS3();
    await expect(listAllParts(s3.client, target)).rejects.toMatchObject({
      code: "OBJECT_NOT_FOUND",
      statusCode: 404,
    });
  });

  it("fails instead of looping when a truncated page has no marker", async () => {
    const client = mockS3((async () => ({
      Parts: [{ PartNumber: 1 }],
      IsTruncated: true,
    })) as never);
    await expect(listAllParts(client, target)).rejects.toThrow(
      /NextPartNumberMarker/,
    );
  });
});
