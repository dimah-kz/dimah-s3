import {
  deleteBatchBodySchema,
  isAPIError,
  S3_API_ROUTES,
  type DeleteBatchResponse,
} from "@dimah-s3/core";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import { deleteStoredObject } from "./delete";

export const deleteBatch = createS3Endpoint(
  S3_API_ROUTES.deleteBatch,
  { method: "POST", body: deleteBatchBodySchema },
  async (ctx): Promise<DeleteBatchResponse> => {
    const config = ctx.context.config;
    const request = ctx.context.request;
    const results: DeleteBatchResponse["results"] = [];

    for (const key of ctx.body.keys) {
      try {
        const { existed } = await deleteStoredObject(
          config,
          { route: ctx.body.route, key },
          request,
        );
        results.push({ key, success: true, existed });
      } catch (err) {
        results.push({
          key,
          success: false,
          error: isAPIError(err)
            ? { code: err.code ?? "INTERNAL_ERROR", message: err.message }
            : { code: "INTERNAL_ERROR", message: "Internal server error" },
        });
      }
    }

    return { results };
  },
);
