"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { DeleteResult, UseDeleteReturn } from "@dimah-s3/react";
import { DeleteConfirmDialog } from "@/components/dimah-s3/delete/delete-confirm-dialog";

/** One object to delete. */
export type DeleteTarget = {
  /**
   * S3 object key. Named `objectKey` because React reserves the `key` prop.
   */
  objectKey: string;
  /** Display name in the dialog and toasts. Defaults to the key's file name. */
  fileName?: string;
  /** Display size in the dialog. */
  fileSize?: number | null;
};

/** Options for {@link DeleteContextValue.request}. */
export type DeleteRequestOptions = {
  /** Extra content in the confirm dialog, below the description. */
  note?: ReactNode;
  /**
   * The element that asked for the delete. Focus returns to it when the
   * dialog closes. Defaults to the focused element.
   */
  trigger?: HTMLElement | null;
  /**
   * Called once this request's delete settles, after the root's
   * `onDeleted`. Not called when the dialog is dismissed.
   */
  onDeleted?: (result: DeleteResult) => void;
};

/** Props for {@link Delete}. */
export type DeleteProps = {
  /** Return value of `useDelete`. */
  delete: UseDeleteReturn;
  /** Ask before deleting. @default true */
  confirm?: boolean;
  /** Replaces the default {@link DeleteConfirmDialog}. */
  dialog?: ReactNode;
  /**
   * Called once per confirmed delete, with every key's outcome. A throw is
   * reported (`reportError`) and does not fail the delete.
   */
  onDeleted?: (result: DeleteResult) => void;
  /**
   * Where focus goes after the dialog closes. Return `null` to use the
   * trigger, or the nearest `[data-dimah-s3-focus-root]` once the trigger
   * is gone.
   */
  restoreFocus?: (targets: readonly DeleteTarget[]) => HTMLElement | null;
  children: ReactNode;
};

/** What {@link useDeleteContext} returns. */
export type DeleteContextValue = {
  /** The root's `useDelete` return. */
  delete: UseDeleteReturn;
  /** The request the dialog asks about, or `null` while it is closed. */
  confirmation: DeleteConfirmation | null;
  /** `true` while the confirmed request deletes. The dialog stays open. */
  isDeleting: boolean;
  /**
   * Asks to delete `targets`. Opens the confirm dialog, or deletes at once
   * when the root has `confirm={false}`. Replaces a pending request.
   */
  request: (
    targets: DeleteTarget | readonly DeleteTarget[],
    options?: DeleteRequestOptions,
  ) => void;
  /**
   * Deletes the targets of `confirmation`, then closes the dialog. Calls
   * made while the delete runs return the same promise. It never rejects.
   */
  confirm: () => Promise<DeleteResult>;
  /** Closes the dialog without deleting. Does nothing while deleting. */
  dismiss: () => void;
};

/** A request waiting for confirmation. */
export type DeleteConfirmation = {
  targets: readonly DeleteTarget[];
  /** Extra content for the dialog, from {@link DeleteRequestOptions.note}. */
  note?: ReactNode;
};

/** A request with the elements focus can return to. */
type ActiveRequest = {
  targets: readonly DeleteTarget[];
  note?: ReactNode;
  onDeleted?: (result: DeleteResult) => void;
  trigger: HTMLElement | null;
  /** The trigger's nearest focus root, found while the trigger is mounted. */
  focusRoot: HTMLElement | null;
};

/** Focus to return once a request ends. */
type FocusReturn = ActiveRequest & {
  /** `false` moves focus only when it was lost, as after a delete without a dialog. */
  always: boolean;
};

const FOCUS_ROOT = "[data-dimah-s3-focus-root]";

const EMPTY_RESULT: DeleteResult = { deleted: [], failed: [], blocked: [] };

const DeleteContext = createContext<DeleteContextValue | null>(null);

/**
 * Root of the delete family. Holds a `useDelete` return and one confirm
 * dialog for every `DeleteTrigger` inside it.
 *
 * Confirming calls `delete.removeMany` with every target and keeps the
 * dialog open until it settles. Focus then returns to `restoreFocus`, the
 * trigger, or the trigger's nearest `[data-dimah-s3-focus-root]` container,
 * the first one still in the document. Toasts come from `DeleteToasts`.
 *
 * @example
 * ```tsx
 * <Delete delete={remove} onDeleted={reload}>
 *   <DeleteTrigger objectKey={key} fileName={name} />
 * </Delete>
 * ```
 */
export function Delete({
  delete: del,
  confirm: confirmFirst = true,
  dialog,
  onDeleted,
  restoreFocus,
  children,
}: DeleteProps) {
  const [active, setActive] = useState<ActiveRequest | null>(null);
  const [isDeleting, setDeleting] = useState(false);
  const [focusReturn, setFocusReturn] = useState<FocusReturn | null>(null);
  const activeRef = useRef<ActiveRequest | null>(null);
  const runningRef = useRef<Promise<DeleteResult> | null>(null);
  const latest = useRef({ del, confirmFirst, onDeleted, restoreFocus });
  useLayoutEffect(() => {
    latest.current = { del, confirmFirst, onDeleted, restoreFocus };
  });

  /** Deletes `request`'s targets. Never rejects: a throw is reported. */
  const removeTargets = useCallback(
    async (request: ActiveRequest): Promise<DeleteResult> => {
      let result: DeleteResult;
      try {
        result = await latest.current.del.removeMany(
          request.targets.map(({ objectKey, fileName }) => ({
            key: objectKey,
            fileName,
          })),
        );
      } catch (error) {
        // A setup error, such as a hook without an `S3Api`.
        reportError(error);
        return EMPTY_RESULT;
      }
      for (const onDeleted of [latest.current.onDeleted, request.onDeleted]) {
        try {
          onDeleted?.(result);
        } catch (error) {
          reportError(error);
        }
      }
      return result;
    },
    [],
  );

  const close = useCallback((request: ActiveRequest) => {
    if (activeRef.current !== request) return;
    activeRef.current = null;
    setActive(null);
    setFocusReturn({ ...request, always: true });
  }, []);

  const request = useCallback<DeleteContextValue["request"]>(
    (input, options = {}) => {
      const targets: readonly DeleteTarget[] = isTargetList(input)
        ? input
        : [input];
      if (targets.length === 0) return;
      const trigger = options.trigger ?? focusedElement();
      const next: ActiveRequest = {
        targets,
        note: options.note,
        onDeleted: options.onDeleted,
        trigger,
        focusRoot: trigger?.closest<HTMLElement>(FOCUS_ROOT) ?? null,
      };
      if (latest.current.confirmFirst) {
        activeRef.current = next;
        setActive(next);
        return;
      }
      void removeTargets(next).then(() => {
        setFocusReturn({ ...next, always: false });
      });
    },
    [removeTargets],
  );

  const confirm = useCallback<DeleteContextValue["confirm"]>(() => {
    if (runningRef.current) return runningRef.current;
    const current = activeRef.current;
    if (!current) return Promise.resolve(EMPTY_RESULT);
    setDeleting(true);
    const running = removeTargets(current).then((result) => {
      runningRef.current = null;
      setDeleting(false);
      close(current);
      return result;
    });
    runningRef.current = running;
    return running;
  }, [close, removeTargets]);

  const dismiss = useCallback(() => {
    if (runningRef.current || !activeRef.current) return;
    close(activeRef.current);
  }, [close]);

  useEffect(() => {
    if (!focusReturn || (!focusReturn.always && !isFocusLost())) return;
    const target = [
      latest.current.restoreFocus?.(focusReturn.targets),
      focusReturn.trigger,
      focusReturn.focusRoot,
    ].find((element) => element?.isConnected);
    target?.focus();
  }, [focusReturn]);

  const confirmation = useMemo<DeleteConfirmation | null>(
    () => (active ? { targets: active.targets, note: active.note } : null),
    [active],
  );
  const value = useMemo<DeleteContextValue>(
    () => ({
      delete: del,
      confirmation,
      isDeleting,
      request,
      confirm,
      dismiss,
    }),
    [del, confirmation, isDeleting, request, confirm, dismiss],
  );

  return (
    <DeleteContext.Provider value={value}>
      {children}
      {confirmFirst ? (dialog ?? <DeleteConfirmDialog />) : null}
    </DeleteContext.Provider>
  );
}

/** The nearest {@link Delete} root. Use it to build your own parts. */
export function useDeleteContext(): DeleteContextValue {
  const value = useContext(DeleteContext);
  if (!value) {
    throw new Error(
      "[dimah-s3] Delete parts must be rendered inside <Delete>.",
    );
  }
  return value;
}

function isTargetList(
  input: DeleteTarget | readonly DeleteTarget[],
): input is readonly DeleteTarget[] {
  return Array.isArray(input);
}

/** Reports an error without throwing, like a failed hook callback. */
function reportError(error: unknown) {
  if (typeof globalThis.reportError === "function") {
    globalThis.reportError(error);
  } else {
    console.error(error);
  }
}

function focusedElement(): HTMLElement | null {
  const element = document.activeElement;
  return element instanceof HTMLElement && element !== document.body
    ? element
    : null;
}

/** `true` when nothing has focus, as after the focused element unmounts. */
function isFocusLost(): boolean {
  return focusedElement() === null;
}
