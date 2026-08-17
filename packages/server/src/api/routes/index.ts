import { confirm } from "./confirm";
import { deleteObject } from "./delete";
import { download } from "./download";
import { multipartAbort } from "./multipart/abort";
import { multipartComplete } from "./multipart/complete";
import { multipartInit } from "./multipart/init";
import { multipartListParts } from "./multipart/list-parts";
import { multipartPart } from "./multipart/part";
import { upload } from "./upload";

/** Core better-call endpoints — keys become `s3.api.*`. */
export const coreEndpoints = {
  upload,
  confirm,
  download,
  delete: deleteObject,
  multipartInit,
  multipartPart,
  multipartListParts,
  multipartComplete,
  multipartAbort,
};

export type CoreEndpoints = typeof coreEndpoints;

export const CORE_ENDPOINT_NAMES = Object.keys(
  coreEndpoints,
) as (keyof CoreEndpoints)[];
