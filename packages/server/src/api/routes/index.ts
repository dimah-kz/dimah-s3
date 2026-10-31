import { catalog } from "./catalog";
import { confirm } from "./confirm";
import { deleteObject } from "./delete";
import { deleteMany } from "./delete-many";
import { download } from "./download";
import { file } from "./file";
import { multipartAbort } from "./multipart/abort";
import { multipartComplete } from "./multipart/complete";
import { multipartInit } from "./multipart/init";
import { multipartListParts } from "./multipart/list-parts";
import { multipartSignPart } from "./multipart/sign-part";
import { upload } from "./upload";

/** Core HTTP endpoints, mounted under `basePath` with plugin endpoints. */
export const coreEndpoints = {
  upload,
  confirm,
  download,
  catalog,
  file,
  delete: deleteObject,
  deleteMany,
  multipartInit,
  multipartSignPart,
  multipartListParts,
  multipartComplete,
  multipartAbort,
};
