/**
 * Test helpers for apps and plugin authors: an in-memory S3, a browser
 * client wired to an instance's handler, and a one-call test instance.
 * Node.js only. Everything here follows semver with `@dimah-s3/server`.
 */
export {
  createMemoryS3,
  type MemoryMultipartUpload,
  type MemoryObject,
  type MemoryS3,
  type MemoryS3Options,
  type MemorySeedInit,
} from "./testing/memory-s3";
export {
  createTestClient,
  uploadTestFile,
  type TestClientOptions,
  type TestHandler,
  type TestUploadInput,
} from "./testing/test-client";
export {
  createTestInstance,
  type TestInstance,
  type TestInstanceConfig,
} from "./testing/test-instance";
