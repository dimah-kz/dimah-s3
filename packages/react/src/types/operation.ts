import type { APIError } from "@dimah-s3/core";

/**
 * How one call for one key ended. Actions return it instead of throwing.
 * `blocked` means a `before*` callback returned `false`; `aborted` means the
 * call was cancelled.
 */
export type OperationOutcome<TData> =
  | { status: "success"; key: string; data: TData }
  | { status: "error"; key: string; error: APIError }
  | { status: "blocked"; key: string }
  | { status: "aborted"; key: string };

/** A key that failed, with its error. */
export type KeyError = { key: string; error: APIError };

/** Byte transfer progress for uploads and fetch downloads. */
export type TransferProgress = {
  /** Bytes transferred so far. */
  loaded: number;
  /** Total bytes to transfer. */
  total: number;
  /** Progress percentage (0–100). */
  percent: number;
  /** Transfer speed in bytes per second. `undefined` until measurable. */
  speed?: number;
};
