import { toNextJsHandler } from "@dimah-s3/server/next";
import { s3 } from "@/lib/s3";

export const { GET, POST, DELETE } = toNextJsHandler(s3);
