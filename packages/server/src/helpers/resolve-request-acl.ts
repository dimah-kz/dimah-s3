import type { S3ObjectAcl } from "@dimah-s3/core";

export type AclPolicy = {
  /** Server-forced ACL — wins over a client value. */
  acl?: S3ObjectAcl;
  /** When true and {@link acl} is unset, honor a client-sent ACL. */
  allowClientAcl?: boolean;
};

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
