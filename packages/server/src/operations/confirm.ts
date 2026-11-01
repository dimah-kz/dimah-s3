import type { UploadConfirmResponse } from "@dimah-s3/core";
import type { ticketBodySchema } from "@dimah-s3/core/schema";
import type * as z from "zod";
import { finalizeConfirmed } from "@/helpers/finalize-confirmed";
import { headObjectOrNotFound } from "@/helpers/head-object";
import { openTicket } from "@/helpers/open-target";
import { runOperation } from "@/operations/run-operation";
import type { S3ServerCallOptions } from "@/types/config";
import type { ResolvedConfig } from "@/types/resolved";

/** Body of `POST /presign/upload/confirm`, after validation. */
export type ConfirmBody = z.output<typeof ticketBodySchema>;

/**
 * Confirms a single-shot upload (`POST /presign/upload/confirm`,
 * `s3.api.confirm`).
 *
 * The ticket names the route, the key and the declared file. After the
 * route guard and the subject check, HeadObject reads the object, and
 * {@link finalizeConfirmed} checks it and runs `upload.confirmGuard` and
 * `upload.onConfirmed`. Confirm keeps no state: a retry with the same ticket
 * runs the checks and hooks again.
 */
export function confirmUpload(
  config: ResolvedConfig,
  body: ConfirmBody,
  options: S3ServerCallOptions = {},
): Promise<UploadConfirmResponse> {
  return runOperation(config, "confirm", options, async (call) => {
    const { route, ticket, context } = await openTicket(
      config,
      call,
      body.ticket,
      "upload",
    );
    const head = await headObjectOrNotFound(
      route.client,
      context.bucket,
      context.key,
    );
    return finalizeConfirmed({
      route,
      context,
      kind: ticket.kind,
      uploadToken: ticket.id,
      file: ticket.file,
      acl: ticket.acl,
      head,
    });
  });
}
