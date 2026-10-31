import type { APIError, S3Api, S3RouteName } from "@dimah-s3/core";
import type { KeyError, OperationOutcome } from "./operation";

/** One delete of one key, as shown by {@link UseDeleteReturn.operations}. */
export type DeleteOperation = {
  /** Unique within the hook instance. Ascends with creation order. */
  id: string;
  /** S3 object key. */
  key: string;
  /** Shared by every key of one `removeMany` call. `null` for `remove`. */
  batchId: string | null;
  /** Display name passed with the key, or `null`. */
  fileName: string | null;
  phase: "deleting" | "success" | "error";
  /** Set when `phase` is `"error"`. */
  error: APIError | null;
};

/**
 * What a successful delete returns. `bucket` is set by `remove` only,
 * because `deleteMany` responses do not carry it.
 */
export type DeleteData = {
  /** S3 object key. */
  key: string;
  /** Target bucket. */
  bucket?: string;
};

/**
 * How a delete of one key ended. `useDelete` has no cancel, so a delete is
 * never `aborted`.
 */
export type DeleteOutcome = Exclude<
  OperationOutcome<DeleteData>,
  { status: "aborted" }
>;

/** How a `remove` or `removeMany` call ended, by key, in call order. */
export type DeleteResult = {
  /** Keys that were deleted. */
  deleted: string[];
  /** Keys that failed, each with its error. */
  failed: KeyError[];
  /** Keys that `beforeDelete` blocked. */
  blocked: string[];
};

/** A key to delete, optionally with a display name for its operation. */
export type DeleteItem = string | { key: string; fileName?: string };

/** Options for `useDelete`. */
export type UseDeleteOptions = {
  /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
  api?: S3Api;
  /** Named server route (`dimahS3({ routes })`). */
  route: S3RouteName;
  /**
   * Runs once per call with the keys it will send. Return `false` to block
   * them. A throw fails them with `HOOK_FAILED`.
   */
  beforeDelete?: (keys: readonly string[]) => boolean | Promise<boolean>;
  /** Runs once per call before the request. A throw fails it with `HOOK_FAILED`. */
  onDeleteStart?: (keys: readonly string[]) => void;
  /** Runs once per deleted key, after every `onError` of the call. */
  onSuccess?: (data: DeleteData, key: string) => void | Promise<void>;
  /** Runs once per failed key. */
  onError?: (error: APIError, key: string) => void;
  /** Runs once per call, after every other callback. */
  onSettled?: (result: DeleteResult) => void | Promise<void>;
};

/** Return value of `useDelete`. */
export type UseDeleteReturn = {
  /** Stable per hook instance (`useId`). Toast owners register under it. */
  instanceId: string;
  /** Every operation still kept, in creation order. */
  operations: readonly DeleteOperation[];
  /** The newest operation for `key`. */
  get: (key: string) => DeleteOperation | undefined;
  /** Keys with a running call, in start order. */
  pendingKeys: readonly string[];
  /** `true` while any key has a running call. */
  isPending: boolean;
  /**
   * Deletes `key`. A call for a key that is already running joins that call
   * and resolves with its outcome without running callbacks again.
   */
  remove: (
    key: string,
    options?: { fileName?: string },
  ) => Promise<DeleteOutcome>;
  /**
   * Deletes any number of keys, sending at most `DELETE_MANY_MAX_KEYS` per
   * `deleteMany` request. Keys that are already running are joined rather
   * than sent again, and their outcomes are folded into the result. Every
   * operation of the call shares one `batchId`.
   */
  removeMany: (items: readonly DeleteItem[]) => Promise<DeleteResult>;
  /**
   * Removes settled operations for `key`, or every settled operation.
   * Running deletes are not cancelled. Stable identity.
   */
  reset: (key?: string) => void;
};
