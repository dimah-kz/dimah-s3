"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { fileNameFromKey, truncateFileName } from "@dimah-s3/core";
import {
  useFormatDimahError,
  useFormatNumber,
  type DeleteOperation,
  type UseDeleteReturn,
} from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { toast } from "@/components/ui/toast";
import { useToastOwner } from "@/hooks/use-toast-owner";

/** Props for {@link DeleteToasts}. */
export type DeleteToastsProps = {
  /** Return value of `useDelete`. */
  delete: UseDeleteReturn;
};

/** One delete result message: a toast, or a live message in an ObjectList. */
export type DeleteToastMessage = {
  type: "success" | "error";
  title: string;
  description?: ReactNode;
};

/** Settled operations of one call that have not been toasted yet. */
type SettledCall = {
  deleted: readonly DeleteOperation[];
  failed: readonly DeleteOperation[];
};

/**
 * Toasts for a `useDelete` return: one success toast and one error toast
 * per call, once every key of the call has settled. Mount it once per hook,
 * next to one `<Toaster />`. A second owner for the same hook renders
 * nothing and warns in development.
 */
export function DeleteToasts({ delete: del }: DeleteToastsProps) {
  useDeleteToasts(del);
  return null;
}

/**
 * The hook behind {@link DeleteToasts}. `weak` owners (ObjectList built-ins)
 * step aside while a strong owner is mounted for the same hook.
 * Deletes that settled before mount are not toasted. `report` replaces
 * `toast.add`, so an ObjectList with `toasts={false}` can read the same
 * messages out in its live region.
 *
 * @internal
 */
export function useDeleteToasts(
  del: UseDeleteReturn,
  options: {
    weak?: boolean;
    report?: (message: DeleteToastMessage) => void;
  } = {},
): void {
  const t = useTranslations();
  const formatError = useFormatDimahError();
  const formatNumber = useFormatNumber();
  const active = useToastOwner(del.instanceId, { weak: options.weak });
  const report = options.report ?? addToast;
  /** Operation ids already toasted, or settled before mount. */
  const toastedRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    toastedRef.current ??= new Set(
      del.operations
        .filter((operation) => operation.phase !== "deleting")
        .map((operation) => operation.id),
    );
    const calls = takeSettledCalls(del.operations, toastedRef.current);
    if (!active) return;

    for (const { deleted, failed } of calls) {
      const [firstDeleted] = deleted;
      if (firstDeleted) {
        report({
          type: "success",
          title:
            deleted.length === 1
              ? t("File deleted", { note: "toast" })
              : t("Deleted {count} files", {
                  note: "toast",
                  variables: { count: formatNumber(deleted.length) },
                }),
          description:
            deleted.length === 1 ? (
              <bdi>{truncateFileName(displayName(firstDeleted))}</bdi>
            ) : undefined,
        });
      }
      const [firstFailed] = failed;
      if (firstFailed) {
        // One cause for every key reads as one message.
        const sameCause = failed.every(
          (operation) => operation.error?.code === firstFailed.error?.code,
        );
        report({
          type: "error",
          title:
            failed.length === 1
              ? t("Delete failed", { note: "toast" })
              : t("Could not delete {count} files", {
                  note: "toast",
                  variables: { count: formatNumber(failed.length) },
                }),
          description: sameCause ? (
            <span className="block [overflow-wrap:anywhere]">
              {formatError(firstFailed.error)}
            </span>
          ) : undefined,
        });
      }
    }
  }, [active, del.operations, formatError, formatNumber, report, t]);
}

/**
 * Groups operations by call (`batchId`, or the operation for `remove`) and
 * returns the calls whose keys have all settled, without the operations
 * already in `toasted`. Adds the returned operations to `toasted`, and drops
 * ids that are no longer listed.
 */
function takeSettledCalls(
  operations: readonly DeleteOperation[],
  toasted: Set<string>,
): SettledCall[] {
  const calls = new Map<string, DeleteOperation[]>();
  for (const operation of operations) {
    const call =
      operation.batchId === null
        ? `operation:${operation.id}`
        : `batch:${operation.batchId}`;
    const list = calls.get(call);
    if (list) list.push(operation);
    else calls.set(call, [operation]);
  }

  const listed = new Set(operations.map((operation) => operation.id));
  for (const id of toasted) {
    if (!listed.has(id)) toasted.delete(id);
  }

  const settled: SettledCall[] = [];
  for (const call of calls.values()) {
    if (call.some((operation) => operation.phase === "deleting")) continue;
    const fresh = call.filter((operation) => !toasted.has(operation.id));
    if (fresh.length === 0) continue;
    for (const operation of fresh) toasted.add(operation.id);
    settled.push({
      deleted: fresh.filter((operation) => operation.phase === "success"),
      failed: fresh.filter((operation) => operation.phase === "error"),
    });
  }
  return settled;
}

function addToast(message: DeleteToastMessage) {
  toast.add(message);
}

function displayName(operation: DeleteOperation): string {
  return operation.fileName ?? fileNameFromKey(operation.key) ?? operation.key;
}
