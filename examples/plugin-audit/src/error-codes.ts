import { defineErrorCodes } from "@dimah-s3/core";

/**
 * Error codes the audit plugin sends. The server plugin throws them with
 * `s3Error`, and the client plugin adds them to `api.$ERROR_CODES`, so this
 * file is imported by both entries.
 */
export const AUDIT_ERROR_CODES = defineErrorCodes({
  AUDIT_ROUTE_UNTRACKED: {
    status: 400,
    message: 'Route "{route}" is not audited',
  },
});
