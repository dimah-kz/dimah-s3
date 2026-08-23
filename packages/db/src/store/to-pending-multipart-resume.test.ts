import { describe, expect, it } from "vitest";
import { toPendingMultipartResume } from "./storage-object-store";
import { sampleObject } from "@/test/fakes";

describe("toPendingMultipartResume", () => {
  it("maps a pending multipart row", () => {
    expect(
      toPendingMultipartResume(
        sampleObject({
          status: "pending",
          uploadId: "up-1",
          declaredSize: 100,
        }),
      ),
    ).toEqual({
      uploadId: "up-1",
      key: "k",
      fileSize: 100,
      bucket: "b",
    });
  });

  it("returns null unless pending + uploadId + declaredSize", () => {
    expect(toPendingMultipartResume(sampleObject())).toBeNull();
    expect(
      toPendingMultipartResume(
        sampleObject({
          status: "pending",
          uploadId: "up-1",
          declaredSize: null,
        }),
      ),
    ).toBeNull();
  });
});
