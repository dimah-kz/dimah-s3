import type { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { resolveObjectAcl } from "./resolve-object-acl";

const ALL_USERS = "http://acs.amazonaws.com/groups/global/AllUsers";

function s3With(send: S3Client["send"]): S3Client {
  return { send } as S3Client;
}

describe("resolveObjectAcl", () => {
  it("returns public-read when AllUsers can READ", async () => {
    const acl = await resolveObjectAcl(
      s3With(
        vi.fn(async () => ({
          Grants: [{ Grantee: { URI: ALL_USERS }, Permission: "READ" }],
        })) as never,
      ),
      "bucket",
      "key",
    );
    expect(acl).toBe("public-read");
  });

  it("returns private when the object is not world-readable", async () => {
    const acl = await resolveObjectAcl(
      s3With(vi.fn(async () => ({ Grants: [] })) as never),
      "bucket",
      "key",
    );
    expect(acl).toBe("private");
  });

  it("returns undefined when ACL lookup fails", async () => {
    const acl = await resolveObjectAcl(
      s3With(
        vi.fn(async () => {
          throw new Error("AccessDenied");
        }) as never,
      ),
      "bucket",
      "key",
    );
    expect(acl).toBeUndefined();
  });
});
