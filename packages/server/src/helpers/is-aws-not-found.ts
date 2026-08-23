import { errors } from "../errors";

/** True when an AWS SDK throw means the object or multipart upload does not exist. */
export function isAwsNotFound(err: unknown): boolean {
  const e = err as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    e?.name === "NoSuchKey" ||
    e?.name === "NotFound" ||
    e?.name === "NoSuchUpload" ||
    e?.Code === "NoSuchKey" ||
    e?.Code === "NotFound" ||
    e?.Code === "NoSuchUpload" ||
    e?.$metadata?.httpStatusCode === 404
  );
}

/** Run an AWS call and map not-found errors to `OBJECT_NOT_FOUND`. */
export async function sendOrObjectNotFound<T>(send: () => Promise<T>): Promise<T> {
  try {
    return await send();
  } catch (err: unknown) {
    if (isAwsNotFound(err)) throw errors.objectNotFound();
    throw err;
  }
}
