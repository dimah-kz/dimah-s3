"use client";

import {
  useCallback,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import {
  addUploadLimit,
  reservedUploadSlots,
  subscribeUploadSlots,
  uploadSlotsLeft,
  type UploadLimitRef,
} from "@/internal/upload-limits";
import type { UploadLimit } from "@/types/upload";
import type { UseUploadReturn } from "./use-upload";

/**
 * Caps the files `upload` takes in at `limit` while the calling component
 * is mounted. `UploadField` uses it for its `maxFiles`.
 *
 * The hook enforces it on every call, wherever it comes from:
 * `handleFiles`, `open`, drops, pastes and `retry`. A call holds its slots
 * from the moment it starts, so two quick calls never take the same ones,
 * and the hook rejects the files past the limit with `TOO_MANY_FILES`. A
 * retry takes only the failed files that fit, in queue order, and leaves
 * the rest as they failed. With several limits on one hook, the strictest
 * wins. `null` sets none.
 *
 * Returns the files that still fit, counting calls still preparing, or
 * `null` without a limit.
 */
export function useUploadLimit(
  upload: Pick<UseUploadReturn, "instanceId" | "files">,
  limit: UploadLimit | null,
): number | null {
  const { instanceId, files } = upload;
  const [ref] = useState<UploadLimitRef>(() => ({ current: limit }));

  // Calls read the newest committed limit.
  useLayoutEffect(() => {
    ref.current = limit;
  });
  useLayoutEffect(() => addUploadLimit(instanceId, ref), [instanceId, ref]);

  const subscribe = useCallback(
    (listener: () => void) => subscribeUploadSlots(instanceId, listener),
    [instanceId],
  );
  const reserved = useSyncExternalStore(
    subscribe,
    () => reservedUploadSlots(instanceId),
    () => 0,
  );

  return limit ? uploadSlotsLeft(limit, files, reserved) : null;
}
