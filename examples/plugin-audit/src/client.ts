import {
  defineClientPlugin,
  pluginPath,
  type S3RequestOptions,
} from "@dimah-s3/core";
import { AUDIT_ERROR_CODES } from "./error-codes";
// Type only: the server plugin never reaches the browser bundle.
import type { audit } from "./index";

export { AUDIT_ERROR_CODES } from "./error-codes";
export type { AuditEvent, AuditEventType } from "./store";

/**
 * Client plugin for `audit()`. Its actions are on `api.audit`, and its
 * error codes on `api.$ERROR_CODES`.
 *
 * ```ts
 * const api = createS3Client({ plugins: [auditClient()] });
 * const { events } = await api.audit.listEvents({ route: "invoices" });
 * ```
 */
export function auditClient() {
  return defineClientPlugin({
    id: "audit",
    // Types `$fetch` by the server plugin's endpoints.
    $InferServerPlugin: {} as ReturnType<typeof audit>,
    $ERROR_CODES: AUDIT_ERROR_CODES,
    getActions: ($fetch) => ({
      listEvents: (
        query: { route?: string; limit?: number } = {},
        options?: S3RequestOptions,
      ) =>
        $fetch(pluginPath("audit", "events"), {
          method: "GET",
          query,
          signal: options?.signal,
          headers: options?.headers,
        }),
    }),
  });
}
