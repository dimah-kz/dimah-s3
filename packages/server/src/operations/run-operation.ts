import { toAPIError } from "@/helpers/error-boundary";
import { createLocals, runGuards } from "@/helpers/hooks";
import { syntheticRequest } from "@/helpers/request";
import type { S3ServerCallOptions } from "@/types/config";
import type { GuardContext, S3Operation } from "@/types/hook-contexts";
import type { ResolvedConfig } from "@/types/resolved";

/**
 * Runs one operation behind the error boundary. HTTP endpoints, `s3.api`
 * and `s3.put` all enter through here.
 *
 * It picks the request (`options.request`, else a synthetic one from
 * `options.headers` and `options.signal`), creates the call's `locals` seeded from
 * `options.locals`, and runs the instance guards. Then it calls `run` with
 * that guard context. Every failure leaves as an `APIError`; see
 * {@link toAPIError}.
 *
 * HTTP endpoints pass only `request`: `locals` is trusted and never read
 * from HTTP.
 */
export async function runOperation<T>(
  config: ResolvedConfig,
  operation: S3Operation,
  options: S3ServerCallOptions,
  run: (context: GuardContext) => Promise<T>,
): Promise<T> {
  const request = options.request ?? syntheticRequest(config, options);
  try {
    const context: GuardContext = {
      request,
      operation,
      locals: createLocals(options.locals),
    };
    await runGuards(config.guard, context);
    return await run(context);
  } catch (error) {
    throw toAPIError(error, config, request, operation);
  }
}
