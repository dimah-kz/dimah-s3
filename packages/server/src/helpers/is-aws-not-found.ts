/** True when an AWS SDK throw means the object (or key) does not exist. */
export function isAwsNotFound(err: unknown): boolean {
  const e = err as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    e?.name === "NoSuchKey" ||
    e?.name === "NotFound" ||
    e?.Code === "NoSuchKey" ||
    e?.Code === "NotFound" ||
    e?.$metadata?.httpStatusCode === 404
  );
}
