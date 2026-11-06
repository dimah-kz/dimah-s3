import type {
  APIError,
  ContentDispositionType,
  DownloadPresignResponse,
  S3Api,
  S3RouteName,
} from "@dimah-s3/core";
import type { OperationOutcome, TransferProgress } from "./operation";

/** Options for one `download(key)` call. */
export type DownloadOptions = {
  /** File name the browser saves, fitted to 255 UTF-8 bytes like an upload name. */
  fileName?: string;
};

/** Options for one `useFetchDownload` `download(key)` call. */
export type FetchDownloadOptions = DownloadOptions & {
  /** Size in bytes. The progress total until the response gives one. */
  fileSize?: number | null;
};

/** Options for one presign request. */
export type PresignOptions = {
  /** File name the browser saves, fitted to 255 UTF-8 bytes like an upload name. */
  fileName?: string;
  /** Requested URL lifetime in seconds. The server caps it at the route's limit. */
  expiresIn?: number;
};

/** One `useDownload` call for one key. */
export type DownloadOperation = {
  /** Unique within the hook instance. Ascends with creation order. */
  id: string;
  key: string;
  /** The requested file name, or `null` when the server picks it. */
  fileName: string | null;
  phase: "presigning" | "success" | "error" | "aborted";
  error: APIError | null;
  /** The signed URL the browser was handed. Set on success. */
  result: DownloadPresignResponse | null;
};

/** How one `useDownload` call ended. */
export type DownloadOutcome = OperationOutcome<DownloadPresignResponse>;

type DownloadBase = {
  /** Optional when an `<S3Provider>` is in the tree. */
  api?: S3Api;
  /** Named server route. */
  route: S3RouteName;
  /** Content-Disposition for the GET. The server can override it. */
  disposition?: ContentDispositionType;
  /** Runs once per call, before presigning. Return `false` to block it. */
  beforeDownload?: (key: string) => boolean | Promise<boolean>;
  /** Runs once when a call fails. */
  onError?: (error: APIError, key: string) => void;
};

/** Options for `useDownload`. */
export type UseDownloadOptions = DownloadBase & {
  /** Runs once the browser has the URL, not when the download completes. */
  onSuccess?: (
    data: DownloadPresignResponse,
    key: string,
  ) => void | Promise<void>;
  /** Runs once per `download` call, however it ended. */
  onSettled?: (outcome: DownloadOutcome) => void | Promise<void>;
};

/** Return of `useDownload`. */
export type UseDownloadReturn = {
  /** Tells this hook apart from `useFetchDownload`. */
  mode: "navigate";
  /** Stable per hook instance. Toast owners use it. */
  instanceId: string;
  /** Every `download` call, ordered by `id`. */
  operations: readonly DownloadOperation[];
  /** The newest operation for `key`. */
  get: (key: string) => DownloadOperation | undefined;
  /** Keys with a running call. */
  pendingKeys: readonly string[];
  isPending: boolean;
  /**
   * Presigns `key` and hands the URL to the browser. A call for a key that
   * is already running joins it.
   */
  download: (
    key: string,
    options?: DownloadOptions,
  ) => Promise<DownloadOutcome>;
  /**
   * Presigns `key` without handing the URL to the browser, such as for a
   * share link. Runs `beforeDownload` only, and records no operation.
   */
  presign: (key: string, options?: PresignOptions) => Promise<DownloadOutcome>;
  /** Aborts the running call for `key`, or every running call. */
  cancel: (key?: string) => void;
  /** Removes settled operations for `key`, or every settled operation. */
  reset: (key?: string) => void;
};

/** What a fetch download saved. */
export type FetchDownloadResult = {
  fileName: string;
  /** Saved size in bytes. */
  size: number;
};

/** One `useFetchDownload` call for one key. */
export type FetchDownloadOperation = {
  /** Unique within the hook instance. Ascends with creation order. */
  id: string;
  key: string;
  /**
   * The requested file name until the response arrives, then the name the
   * file is saved as.
   */
  fileName: string | null;
  /** Size in bytes, once known. */
  fileSize: number | null;
  phase: "presigning" | "downloading" | "success" | "error" | "aborted";
  error: APIError | null;
  progress: TransferProgress;
};

/** How one `useFetchDownload` call ended. */
export type FetchDownloadOutcome = OperationOutcome<FetchDownloadResult>;

/** Options for `useFetchDownload`. */
export type UseFetchDownloadOptions = DownloadBase & {
  /**
   * Runs once when the byte transfer begins. A throw fails the call with
   * `HOOK_FAILED`.
   */
  onDownloadStart?: (key: string) => void;
  /** Runs after each chunk of bytes arrives. */
  onProgress?: (progress: TransferProgress, key: string) => void;
  /** Runs once the file is saved. */
  onSuccess?: (data: FetchDownloadResult, key: string) => void | Promise<void>;
  /** Runs once per `download` call, however it ended. */
  onSettled?: (outcome: FetchDownloadOutcome) => void | Promise<void>;
};

/** Return of `useFetchDownload`. */
export type UseFetchDownloadReturn = {
  /** Tells this hook apart from `useDownload`. */
  mode: "fetch";
  /** Stable per hook instance. Toast owners use it. */
  instanceId: string;
  /** Every `download` call, ordered by `id`. */
  operations: readonly FetchDownloadOperation[];
  /** The newest operation for `key`. */
  get: (key: string) => FetchDownloadOperation | undefined;
  /** Keys with a running call. */
  pendingKeys: readonly string[];
  isPending: boolean;
  /**
   * Presigns `key`, fetches its bytes with progress and saves them. A call
   * for a key that is already running joins it. `fileSize` sets the
   * progress total until the response gives one.
   */
  download: (
    key: string,
    options?: FetchDownloadOptions,
  ) => Promise<FetchDownloadOutcome>;
  /** Aborts the running call for `key`, or every running call. */
  cancel: (key?: string) => void;
  /** Removes settled operations for `key`, or every settled operation. */
  reset: (key?: string) => void;
};

/** Either download hook's return. Narrow it on `mode`. */
export type AnyDownloadReturn = UseDownloadReturn | UseFetchDownloadReturn;
