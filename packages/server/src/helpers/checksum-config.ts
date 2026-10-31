import { s3Error } from "@dimah-s3/core";
import type { S3Client } from "@aws-sdk/client-s3";
import { ConfigError } from "@/helpers/error-boundary";

type ChecksumCheck =
  { ok: true } | { ok: false; error: ConfigError; reported: boolean };

const checks = new WeakMap<S3Client, Promise<ChecksumCheck>>();

/**
 * Checks once per client that the AWS SDK does not add flexible checksums
 * to presigned requests. With `requestChecksumCalculation: "WHEN_SUPPORTED"`
 * (the SDK default since 3.729) a presigned URL signs a checksum of an empty
 * body, and every upload to it fails at S3.
 *
 * The first failing call throws a {@link ConfigError}, which the error
 * boundary logs. Later calls with the same client fail with
 * `INTERNAL_ERROR` without logging again. An SDK without the option passes.
 */
export async function assertChecksumConfig(client: S3Client): Promise<void> {
  let check = checks.get(client);
  if (!check) {
    check = readChecksumConfig(client);
    checks.set(client, check);
  }
  const result = await check;
  if (result.ok) return;
  if (!result.reported) {
    result.reported = true;
    throw result.error;
  }
  throw s3Error("INTERNAL_ERROR", undefined, { cause: result.error });
}

async function readChecksumConfig(client: S3Client): Promise<ChecksumCheck> {
  const option: unknown = (
    client.config as { requestChecksumCalculation?: unknown }
  ).requestChecksumCalculation;
  const value: unknown = typeof option === "function" ? await option() : option;
  if (value === undefined || value === "WHEN_REQUIRED") return { ok: true };
  const shown = typeof value === "string" ? value : typeof value;
  return {
    ok: false,
    reported: false,
    error: new ConfigError(
      `The S3Client has requestChecksumCalculation "${shown}", which ` +
        'breaks presigned uploads. Create it with requestChecksumCalculation: "WHEN_REQUIRED".',
    ),
  };
}
