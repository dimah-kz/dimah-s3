import {
  GetObjectAclCommand,
  type GetObjectAclCommandOutput,
  type S3Client,
} from "@aws-sdk/client-s3";

const DEFAULT_ACL_LOOKUP_TIMEOUT_MS = 1_500;

/**
 * Determines the ACL of an S3 object by querying `GetObjectAcl`.
 *
 * Returns `"public-read"` when the `AllUsers` grantee has `READ` or
 * `FULL_CONTROL` permission, `"private"` when ACL is resolvable but not public,
 * and `undefined` when ACL cannot be resolved (e.g. unsupported providers).
 */
export async function resolveObjectAcl(
  s3: S3Client,
  bucket: string,
  key: string,
  timeoutMs: number = DEFAULT_ACL_LOOKUP_TIMEOUT_MS,
): Promise<"public-read" | "private" | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = (await s3.send(
      new GetObjectAclCommand({ Bucket: bucket, Key: key }),
      { abortSignal: controller.signal },
    )) as GetObjectAclCommandOutput;
    const isPublic = result.Grants?.some(
      (g) =>
        g.Grantee?.URI === "http://acs.amazonaws.com/groups/global/AllUsers" &&
        (g.Permission === "READ" || g.Permission === "FULL_CONTROL"),
    );
    return isPublic ? "public-read" : "private";
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
