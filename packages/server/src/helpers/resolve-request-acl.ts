import type { S3ObjectAcl } from "@dimah-s3/core";
import type { AclPolicy } from "@/types/config";

export type { AclPolicy };

/** Resolve object ACL. Default is `private`. */
export function resolveRequestAcl(
  policy: AclPolicy | undefined,
): S3ObjectAcl {
  return policy?.acl ?? "private";
}
