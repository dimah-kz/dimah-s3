import { Fragment } from "react";
import {
  S3_ERROR_CODES,
  type S3ErrorCode,
  type S3ErrorParamsMap,
} from "@dimah-s3/core";

/**
 * When each code is raised. Typed against the catalog, so adding or removing
 * a code in `@dimah-s3/core` fails `check-types` until this list follows.
 */
const WHEN = {
  VALIDATION_ERROR:
    "The body or query does not match the endpoint schema, or a share link setting breaks a `share()` rule, which `rule` names.",
  REQUEST_TOO_LARGE: "The request body is larger than `maxRequestBodySize`.",
  UNSUPPORTED_MEDIA_TYPE: "A body endpoint got a body that is not JSON.",
  NOT_FOUND: "No endpoint serves the request path.",
  UNAUTHORIZED: "A guard rejects an anonymous caller.",
  FORBIDDEN: "A guard or `authorize` rejects the caller.",
  CONFLICT:
    "A concurrent change won, or `db()` purge is cleaning the key. A retry may succeed.",
  TOO_MANY_REQUESTS:
    "Your guard limits calls and refused this one. The library never sends it.",
  INTERNAL_ERROR:
    "Unhandled server error, or a non-JSON error response with status 500 or above.",
  S3_NETWORK_ERROR: "The server cannot reach the S3 endpoint.",
  ROUTE_NOT_FOUND: "The `route` name is not registered on the server.",
  FEATURE_DISABLED:
    "The route does not enable the requested operation, or `/file` was asked for a route that is not in proxy mode.",
  KEY_INVALID: "The key is unsafe, or outside the route `keyPrefix`.",
  OBJECT_NOT_FOUND:
    "The object or multipart upload does not exist, or `db()` tracks it for another scope.",
  RANGE_NOT_SATISFIABLE: "A `/file` `Range` header is outside the object.",
  PRECONDITION_FAILED: "A `/file` `If-Match` or `If-Unmodified-Since` fails.",
  FILE_EMPTY: "The file has 0 bytes. `validateFile` checks it before upload.",
  FILE_TOO_LARGE: "The file is larger than the route `maxFileSize`.",
  FILE_TYPE_NOT_ALLOWED: "The file type is not in the route `fileTypes`.",
  FILE_CONTENT_MISMATCH:
    "With `verifyContent`, the stored bytes do not match the declared type.",
  CHECKSUM_REQUIRED: "The route needs a SHA-256 checksum and none was sent.",
  QUOTA_EXCEEDED: "The upload would go over the `db()` byte or file quota.",
  UPLOAD_TICKET_INVALID:
    "The upload ticket is forged, for another call, or for another subject.",
  UPLOAD_TICKET_EXPIRED: "The upload ticket is past its expiry.",
  UPLOAD_SIZE_MISMATCH: "The stored size differs from the declared `size`.",
  MULTIPART_PART_MISSING: "Complete found a part that was never uploaded.",
  MULTIPART_PART_INVALID: "The part number is outside the server's layout.",
  OBJECT_EXISTS:
    'A `db()` route without `replace: "overwrite"` already holds an object at the key.',
  FOLDER_INVALID:
    "The folder name is not valid, the resulting path is too long or too deep, or a folder would move into itself.",
  FOLDER_NOT_FOUND: "That folder id is not in the caller's scope.",
  FOLDER_EXISTS: "That parent already has a folder with this name.",
  FOLDER_NOT_EMPTY: "A `db()` folder still holds folders or live objects.",
  SHARE_LINK_NOT_FOUND:
    "No share link has the token, or the owner asked for another scope's link.",
  SHARE_LINK_EXPIRED: "The share link is past its `expiresAt`.",
  SHARE_LINK_REVOKED: "The owner turned the share link off.",
  SHARE_LINK_EXHAUSTED: "The share link reached its `maxDownloads`.",
  SHARE_TARGET_UNAVAILABLE:
    "The shared file or folder was deleted, its route was removed, or `authorizeVisit` refused the call.",
  SHARE_PASSWORD_REQUIRED:
    "A visitor call on a password-protected link without a valid `access`.",
  SHARE_PASSWORD_INVALID: "`unlockLink` got the wrong password.",
  SHARE_FOLDER_LINKS_DISABLED:
    "A folder share link while `share({ folders: false })`.",
  SHARE_DOWNLOAD_URL_INVALID: "A `/share/file` URL is forged or expired.",
  TOO_MANY_FILES: "More files were added than `maxFiles` allows.",
  HOOK_FAILED:
    "A `before*` or `on*Start` callback, or an `uploadOptions` function, threw. `hook` names it.",
  NETWORK_ERROR: "The browser request failed before a response arrived.",
  UPLOAD_FAILED: "S3 rejected the upload. `status` is S3's HTTP status.",
  DOWNLOAD_FAILED: "`useFetchDownload` got a non-2xx response.",
  CHECKSUM_MISMATCH: "The uploaded bytes do not match their checksum.",
  PARTIAL_FAILURE:
    "`useUpload().error` when two or more files of the queue failed, also when every file did.",
  UNKNOWN_ERROR:
    "Any other failure, or a non-JSON error response below status 500.",
} satisfies Record<S3ErrorCode, string>;

export type ErrorCodeTableProps = {
  /**
   * Only codes the server sends, or only codes the browser raises
   * (`client: true` in the catalog). Omit for every code.
   */
  raisedBy?: "server" | "client";
};

/**
 * `params` names per code. Typed against `S3ErrorParamsMap`, so a missing or
 * extra name fails `check-types`.
 */
const PARAMS = {
  VALIDATION_ERROR: {
    issue: true,
    rule: true,
    minLength: true,
    maxExpiresIn: true,
  },
  REQUEST_TOO_LARGE: { maxSize: true },
  S3_NETWORK_ERROR: { code: true },
  ROUTE_NOT_FOUND: { route: true },
  FEATURE_DISABLED: { feature: true },
  FILE_TOO_LARGE: { size: true, maxFileSize: true },
  FILE_TYPE_NOT_ALLOWED: { type: true, allowed: true },
  FILE_CONTENT_MISMATCH: { type: true, detected: true },
  QUOTA_EXCEEDED: { limit: true },
  UPLOAD_SIZE_MISMATCH: { expected: true, actual: true },
  MULTIPART_PART_MISSING: { partNumber: true },
  MULTIPART_PART_INVALID: { partNumber: true, partCount: true },
  TOO_MANY_FILES: { maxFiles: true },
  HOOK_FAILED: { hook: true },
  UPLOAD_FAILED: { status: true },
  DOWNLOAD_FAILED: { status: true },
  PARTIAL_FAILURE: { failed: true, total: true },
} satisfies {
  [C in keyof S3ErrorParamsMap]: Record<keyof S3ErrorParamsMap[C], true>;
};

function paramNames(code: S3ErrorCode): string[] {
  return Object.hasOwn(PARAMS, code)
    ? Object.keys(PARAMS[code as keyof typeof PARAMS])
    : [];
}

/** Renders `` `code` `` spans of a plain string as inline code. */
function InlineCode({ text }: { text: string }) {
  return text
    .split("`")
    .map((part, index) =>
      index % 2 === 1 ? (
        <code key={index}>{part}</code>
      ) : (
        <Fragment key={index}>{part}</Fragment>
      ),
    );
}

function catalogEntries(raisedBy: ErrorCodeTableProps["raisedBy"]) {
  return Object.values(S3_ERROR_CODES).filter((entry) => {
    if (raisedBy === undefined) return true;
    const client = "client" in entry && entry.client;
    return raisedBy === "client" ? client : !client;
  });
}

/**
 * The same table as Markdown, for the `.md` twin of a page and
 * `llms-full.txt`, where the component does not render.
 */
export function errorCodeTableMarkdown(
  raisedBy?: ErrorCodeTableProps["raisedBy"],
): string {
  const rows = catalogEntries(raisedBy).map((entry) => {
    const params = paramNames(entry.code);
    const paramCell =
      params.length === 0 ? "—" : params.map((p) => `\`${p}\``).join(", ");
    const when = WHEN[entry.code].replaceAll("|", "\\|");
    return `| \`${entry.code}\` | ${entry.status} | ${paramCell} | ${when} |`;
  });
  return [
    "| `code` | HTTP | `params` | When |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/**
 * The error catalog as a table: each code from `S3_ERROR_CODES` with its
 * HTTP status, its `params`, and when it is raised.
 */
export function ErrorCodeTable({ raisedBy }: ErrorCodeTableProps) {
  const entries = catalogEntries(raisedBy);

  return (
    <table>
      <thead>
        <tr>
          <th>
            <code>code</code>
          </th>
          <th>HTTP</th>
          <th>
            <code>params</code>
          </th>
          <th>When</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const params = paramNames(entry.code);
          return (
            <tr key={entry.code}>
              <td>
                <code>{entry.code}</code>
              </td>
              <td>{entry.status}</td>
              <td>
                {params.length === 0
                  ? "—"
                  : params.map((param, index) => (
                      <Fragment key={param}>
                        {index > 0 && ", "}
                        <code>{param}</code>
                      </Fragment>
                    ))}
              </td>
              <td>
                <InlineCode text={WHEN[entry.code]} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
