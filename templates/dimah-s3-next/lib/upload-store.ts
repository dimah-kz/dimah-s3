/**
 * Default upload store for resumable multipart (browser localStorage).
 * Pass a custom `UploadStore` for server-backed / cross-device resume.
 */

import type { UploadStore } from "@dimah-s3/react";
import { createLocalStorageStore } from "@dimah-s3/react";

export const localStorageStore: UploadStore = createLocalStorageStore();
