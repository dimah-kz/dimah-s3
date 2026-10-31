import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { memoryS3, TEST_BUCKET } from "@/test/harness";
import { headObjectOrNotFound } from "./head-object";

describe("headObjectOrNotFound", () => {
  it("returns the HeadObject output and forwards the abort signal", async () => {
    const s3 = memoryS3();
    s3.seed("uploads/a.png", "0123456789", { contentType: "image/png" });
    const controller = new AbortController();

    await expect(
      headObjectOrNotFound(s3.client, TEST_BUCKET, "uploads/a.png", {
        abortSignal: controller.signal,
      }),
    ).resolves.toMatchObject({ ContentLength: 10, ContentType: "image/png" });
    const [command, options] = s3.send.mock.calls[0];
    expect(command).toBeInstanceOf(HeadObjectCommand);
    expect(options).toEqual({ abortSignal: controller.signal });
  });

  it("maps a missing object to OBJECT_NOT_FOUND", async () => {
    const s3 = memoryS3();

    await expect(
      headObjectOrNotFound(s3.client, TEST_BUCKET, "uploads/missing.png"),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND", statusCode: 404 });
  });
});
