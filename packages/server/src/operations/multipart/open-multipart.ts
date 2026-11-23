import type { ticketBodySchema } from "@dimah-s3/core/schema";
import type * as z from "zod";
import type { PartLayout } from "@/helpers/part-layout";
import { openTicket } from "@/helpers/open-target";
import type { UploadTicket } from "@/helpers/ticket";
import type {
  GuardContext,
  MultipartUploadContext,
  ObjectContext,
} from "@/types/hook-contexts";
import type { OpenedRoute, ResolvedConfig } from "@/types/resolved";

/** Body of the multipart list, complete and abort calls, after validation. */
export type MultipartTicketBody = z.output<typeof ticketBodySchema>;

export type OpenedMultipart = {
  route: OpenedRoute<"multipart">;
  ticket: UploadTicket<"multipart">;
  /** Context with the key and bucket, for the confirm hooks. */
  objectContext: ObjectContext;
  /** Context for `upload.multipart.guard` and `onAbort`. */
  context: MultipartUploadContext;
  /** The part layout chosen at init. */
  layout: PartLayout;
};

/**
 * Opens a multipart call after init: sign part, list, complete or abort.
 * The ticket is verified, the route guard runs and the subject is checked
 * (see {@link openTicket}). The caller runs `upload.multipart.guard`.
 */
export async function openMultipart(
  config: ResolvedConfig,
  call: GuardContext,
  token: string,
): Promise<OpenedMultipart> {
  const { route, ticket, context } = await openTicket(
    config,
    call,
    token,
    "multipart",
  );
  return {
    route,
    ticket,
    objectContext: context,
    context: {
      ...context,
      uploadId: ticket.uploadId,
      uploadToken: ticket.id,
      file: ticket.file,
    },
    layout: {
      size: ticket.file.size,
      partSize: ticket.partSize,
      partCount: ticket.partCount,
    },
  };
}
