import { s3Error } from "@dimah-s3/core";

/*
 * Reads a failed S3 call. The AWS SDK names its errors (`NoSuchKey`), some
 * S3-compatible providers only set `Code`, and every response carries the
 * HTTP status in `$metadata`, so each check accepts any of the three.
 */

type AwsErrorFields = {
  name?: unknown;
  Code?: unknown;
  $metadata?: { httpStatusCode?: unknown };
};

function fields(error: unknown): AwsErrorFields {
  return typeof error === "object" && error !== null
    ? (error as AwsErrorFields)
    : {};
}

/** The error `name` or `Code` is one of `names`. */
function named(error: unknown, names: readonly string[]): boolean {
  const { name, Code } = fields(error);
  return (
    (typeof name === "string" && names.includes(name)) ||
    (typeof Code === "string" && names.includes(Code))
  );
}

function matches(
  error: unknown,
  names: readonly string[],
  status: number,
): boolean {
  return named(error, names) || awsStatus(error) === status;
}

/** The HTTP status S3 answered a failed call with, when there was one. */
export function awsStatus(error: unknown): number | undefined {
  const status = fields(error).$metadata?.httpStatusCode;
  return typeof status === "number" ? status : undefined;
}

/**
 * The object, or the multipart upload, does not exist. A missing bucket is
 * a 404 too, but it is a config error, so it does not count.
 */
export function isAwsNotFound(error: unknown): boolean {
  if (named(error, ["NoSuchBucket"])) return false;
  return matches(error, ["NoSuchKey", "NotFound", "NoSuchUpload"], 404);
}

/** An `If-Match` or `If-Unmodified-Since` condition failed. */
export function isAwsPreconditionFailed(error: unknown): boolean {
  return matches(error, ["PreconditionFailed"], 412);
}

/** The provider does not implement the request, such as a conditional delete. */
export function isAwsNotImplemented(error: unknown): boolean {
  return matches(error, ["NotImplemented"], 501);
}

/** The requested byte range is outside the object. */
export function isAwsRangeNotSatisfiable(error: unknown): boolean {
  return matches(error, ["InvalidRange"], 416);
}

/** Runs an S3 call and turns a not-found error into `OBJECT_NOT_FOUND`. */
export async function sendOrObjectNotFound<T>(
  send: () => Promise<T>,
): Promise<T> {
  try {
    return await send();
  } catch (error) {
    if (isAwsNotFound(error)) {
      throw s3Error("OBJECT_NOT_FOUND", undefined, { cause: error });
    }
    throw error;
  }
}
