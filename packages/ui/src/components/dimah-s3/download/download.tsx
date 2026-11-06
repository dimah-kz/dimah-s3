"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { fileNameFromKey } from "@dimah-s3/core";
import {
  useFormatFileSize,
  type AnyDownloadReturn,
  type DownloadOperation,
  type FetchDownloadOperation,
  type TransferProgress,
} from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";

/** Props for {@link Download}. */
export type DownloadProps = {
  /** A `useDownload` or `useFetchDownload` return. */
  download: AnyDownloadReturn;
  children: ReactNode;
};

/** What {@link useDownloadContext} returns. */
export type DownloadContextValue = { download: AnyDownloadReturn };

const DownloadContext = createContext<DownloadContextValue | null>(null);

/**
 * Root of the download family. It holds one download hook for the
 * `DownloadTrigger` and `DownloadProgress` parts inside it. It renders no
 * element of its own.
 */
export function Download({ download, children }: DownloadProps) {
  const value = useMemo(() => ({ download }), [download]);
  return (
    <DownloadContext.Provider value={value}>
      {children}
    </DownloadContext.Provider>
  );
}

/** The hook of the nearest {@link Download}. Use it to build your own parts. */
export function useDownloadContext(): DownloadContextValue {
  const value = useContext(DownloadContext);
  if (!value) {
    throw new Error(
      "[dimah-s3] Download parts must be rendered inside <Download>.",
    );
  }
  return value;
}

/** Whether a download operation is still running. @internal */
export function isDownloadRunning(
  operation: DownloadOperation | FetchDownloadOperation,
): boolean {
  return operation.phase === "presigning" || operation.phase === "downloading";
}

/** The name to show for an operation's file. @internal */
export function downloadDisplayName(
  operation: DownloadOperation | FetchDownloadOperation,
): string {
  return operation.fileName ?? fileNameFromKey(operation.key) ?? operation.key;
}

/**
 * Formats the bytes received so far, with the total when it is known.
 * Returns `null` before the first byte when the total is unknown. @internal
 */
export function useFormatDownloadedBytes(): (
  progress: TransferProgress,
) => string | null {
  const t = useTranslations();
  const formatFileSize = useFormatFileSize();
  return useCallback(
    ({ loaded, total }: TransferProgress) => {
      if (total > 0) {
        return t("{loaded} of {total}", {
          note: "transfer progress",
          variables: {
            loaded: formatFileSize(loaded),
            total: formatFileSize(total),
          },
        });
      }
      return loaded > 0 ? formatFileSize(loaded) : null;
    },
    [t, formatFileSize],
  );
}
