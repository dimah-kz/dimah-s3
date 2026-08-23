import type { S3ObjectAcl } from "@dimah-s3/core";
import type { AclPolicy } from "@/types/config";

export type { AclPolicy };

/**
 * Resolve object ACL. Default is `private`. A server `acl` is forced.
 * Client `acl` is used only when `allowClientAcl` is set and no server ACL
 * is configured.
 */
export function resolveRequestAcl(
  policy: AclPolicy | undefined,
  requested?: S3ObjectAcl,
): S3ObjectAcl {
  if (policy?.acl) return policy.acl;
  if (policy?.allowClientAcl && requested) return requested;
  return "private";
}
