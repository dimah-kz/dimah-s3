import { defineErrorCodes } from "@dimah-s3/core";

/**
 * Error codes the share plugin sends. The server plugin throws them with
 * `s3Error`, and `shareClient()` adds them to `api.$ERROR_CODES`, so both
 * entries import this file. A visitor holds the token, so telling an
 * expired link from a revoked one reveals nothing new.
 */
export const SHARE_ERROR_CODES = defineErrorCodes({
  SHARE_LINK_NOT_FOUND: { status: 404, message: "Share link not found" },
  SHARE_LINK_EXPIRED: { status: 410, message: "Share link has expired" },
  SHARE_LINK_REVOKED: { status: 410, message: "Share link was turned off" },
  SHARE_LINK_EXHAUSTED: {
    status: 410,
    message: "Share link reached its download limit",
  },
  SHARE_TARGET_UNAVAILABLE: {
    status: 410,
    message: "The shared item is no longer available",
  },
  SHARE_PASSWORD_REQUIRED: {
    status: 401,
    message: "Share link needs a password",
  },
  SHARE_PASSWORD_INVALID: { status: 401, message: "Wrong password" },
  SHARE_FOLDER_LINKS_DISABLED: {
    status: 400,
    message: "Folder share links are turned off",
  },
  SHARE_DOWNLOAD_URL_INVALID: {
    status: 403,
    message: "Download URL is invalid or has expired",
  },
});
