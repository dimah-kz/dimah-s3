import { toNextJsHandler } from "@dimah-s3/server/next";
import { s3 } from "@/lib/s3";

export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(s3);
