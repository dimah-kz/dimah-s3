import type { DimahS3HandlerSource } from "./types";

/** Structural SvelteKit event — avoids a hard dependency on `@sveltejs/kit`. */
type SvelteKitRequestEvent = {
  request: Request;
};

/**
 * Adapt a dimah-s3 instance to a SvelteKit request handler.
 *
 * @example
 * ```ts
 * // src/routes/api/s3/[...path]/+server.ts
 * import { toSvelteKitHandler } from "@dimah-s3/server/svelte-kit";
 * import { s3 } from "$lib/s3";
 *
 * const handler = toSvelteKitHandler(s3);
 * export const GET = handler;
 * export const POST = handler;
 * export const PUT = handler;
 * export const PATCH = handler;
 * export const DELETE = handler;
 * ```
 */
export function toSvelteKitHandler(s3: DimahS3HandlerSource) {
  return (event: SvelteKitRequestEvent) => s3.handler(event.request);
}
