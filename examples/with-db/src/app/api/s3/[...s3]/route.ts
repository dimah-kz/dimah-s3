import { toNextJsHandler } from "@dimah-s3/server/next";
import { getS3 } from "@/lib/s3";

export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler({
  handler: (request) => getS3().handler(request),
});
