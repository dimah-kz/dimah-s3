import type { S3ObjectAcl } from "@dimah-s3/core";

/** Resolve object ACL. Default is `private`. */
export function resolveRequestAcl(acl?: S3ObjectAcl): S3ObjectAcl {
  return acl ?? "private";
}
