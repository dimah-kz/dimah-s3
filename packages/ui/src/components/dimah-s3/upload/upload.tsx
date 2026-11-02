"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type {
  UploadCallOptions,
  UploadRequestOptions,
  UseUploadReturn,
} from "@dimah-s3/react";
import { mergeUploadRequest } from "@dimah-s3/react/engine";
import { useOptionalObjectListContext } from "@/components/dimah-s3/list/object-list-context";

/** Props for {@link Upload}. */
export type UploadProps = {
  /** The `useUpload` return its parts read. */
  upload: UseUploadReturn;
  /**
   * Marks the root as full: `UploadTrigger` and `UploadDropzone` stay
   * focusable but are `aria-disabled`. It only changes how they render, so
   * `upload` must take no files itself. `UploadField` sets it, with a capped
   * `upload`, once it is full. @default false
   */
  isFull?: boolean;
  /**
   * Leaves files that uploaded out of `UploadStatus` and `UploadFileList`,
   * which then show only files in flight or failed. `UploadField` sets it,
   * since its value lists those files. @default false
   */
  hideUploaded?: boolean;
  children: ReactNode;
};

/** What {@link Upload} shares with its parts. */
export type UploadContextValue = {
  upload: UseUploadReturn;
  /** The root takes no more files, as in a full `UploadField`. Parts render `aria-disabled`. */
  isFull: boolean;
  /** Status parts leave out files that uploaded, as in an `UploadField`. */
  hideUploaded: boolean;
};

const UploadContext = createContext<UploadContextValue | null>(null);

/** Set on `UploadTrigger` and `UploadDropzone` to the id of their root. */
const INTAKE_ATTRIBUTE = "data-dimah-s3-upload-intake";

/** Focus handling the root shares with its parts. */
type UploadFocusValue = {
  /** Marks a picker or drop element of this root, a place focus can go. */
  intakeProps: { [INTAKE_ATTRIBUTE]: string };
  /** Call before an action that may remove the focused element. */
  keepFocus: () => void;
};

const UploadFocusContext = createContext<UploadFocusValue | null>(null);

/** Containers of actions that remove their own card. */
const ACTION_SCOPE =
  "[data-slot=upload-status], [data-slot=upload-file-list], [data-slot=upload-field-value]";

const FOCUS_ROOT = "[data-dimah-s3-focus-root]";

/** Where focus may go once the focused action is gone, best first. */
type FocusHandoff = {
  from: HTMLElement;
  /** Actions outside the removed card: the next ones, then the previous ones. */
  candidates: HTMLElement[];
  scope: HTMLElement;
  focusRoot: HTMLElement | null;
};

/**
 * Root of the upload family. It shares `upload` with `UploadTrigger`,
 * `UploadDropzone`, `UploadStatus` and `UploadFileList`, and renders the
 * hidden file input they open. It adds no element of its own.
 *
 * @example
 * ```tsx
 * const upload = useUpload({ route: "avatars" });
 *
 * <Upload upload={upload}>
 *   <UploadTrigger />
 *   <UploadStatus />
 * </Upload>
 * <UploadToasts upload={upload} />
 * ```
 */
export function Upload({
  upload,
  isFull = false,
  hideUploaded = false,
  children,
}: UploadProps) {
  const value = useMemo(
    () => ({ upload, isFull, hideUploaded }),
    [hideUploaded, isFull, upload],
  );
  const rootId = useId();
  const handoffRef = useRef<FocusHandoff | null>(null);

  const keepFocus = useCallback(() => {
    handoffRef.current = focusHandoff();
  }, []);
  const focus = useMemo<UploadFocusValue>(
    () => ({ intakeProps: { [INTAKE_ATTRIBUTE]: rootId }, keepFocus }),
    [keepFocus, rootId],
  );

  // Runs after every render: the removal can land a few renders after the
  // action, such as when a cancelled file leaves the queue.
  useEffect(() => {
    const handoff = handoffRef.current;
    if (!handoff) return;
    const active = document.activeElement;
    if (handoff.from.isConnected && active === handoff.from) return;
    handoffRef.current = null;
    // Only focus that was lost moves; focus the user moved stays.
    if (active instanceof HTMLElement && active !== document.body) return;
    handoffTarget(handoff, rootId)?.focus();
  });

  return (
    <UploadContext.Provider value={value}>
      <UploadFocusContext.Provider value={focus}>
        <input {...upload.getInputProps()} />
        {children}
      </UploadFocusContext.Provider>
    </UploadContext.Provider>
  );
}

/** The `upload` of the nearest {@link Upload}. Use it to build your own parts. */
export function useUploadContext(): UploadContextValue {
  const value = useContext(UploadContext);
  if (!value) {
    throw new Error(
      "[dimah-s3] Upload parts must be rendered inside <Upload>.",
    );
  }
  return value;
}

/**
 * Focus handling of the nearest {@link Upload}: `intakeProps` for a picker
 * or drop element, and `keepFocus` to call before an action that removes
 * the element it is on. Focus then moves to the next action in the same
 * status or list, else the previous one, else the root's trigger or
 * dropzone, else the nearest `[data-dimah-s3-focus-root]`. @internal
 */
export function useUploadFocus(): UploadFocusValue {
  const value = useContext(UploadFocusContext);
  if (!value) {
    throw new Error(
      "[dimah-s3] Upload parts must be rendered inside <Upload>.",
    );
  }
  return value;
}

/** Where focus can go if the action that has it removes its card. */
function focusHandoff(): FocusHandoff | null {
  const from = document.activeElement;
  if (!(from instanceof HTMLElement)) return null;
  const inner = from.closest<HTMLElement>(ACTION_SCOPE);
  if (!inner) return null;
  // The outermost container, so a file list inside a status counts as one.
  let scope = inner;
  for (
    let parent = scope.parentElement?.closest<HTMLElement>(ACTION_SCOPE);
    parent;
    parent = parent.parentElement?.closest<HTMLElement>(ACTION_SCOPE)
  ) {
    scope = parent;
  }
  // The card that goes away: a list item, or the whole container.
  const item = from.closest<HTMLElement>("li");
  const card = item && scope.contains(item) ? item : scope;
  const actions = [...scope.querySelectorAll<HTMLElement>("button")].filter(
    (button) => !card.contains(button),
  );
  const after = actions.filter(
    (button) =>
      from.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
  const before = actions.filter((button) => !after.includes(button));
  return {
    from,
    candidates: [...after, ...before.reverse()],
    scope,
    focusRoot: scope.closest<HTMLElement>(FOCUS_ROOT),
  };
}

function handoffTarget(
  handoff: FocusHandoff,
  rootId: string,
): HTMLElement | null {
  const intake = document.querySelectorAll<HTMLElement>(
    `[${INTAKE_ATTRIBUTE}="${CSS.escape(rootId)}"]`,
  );
  return (
    [
      ...handoff.candidates,
      // The container can redraw its cards, as when one file is left.
      ...(handoff.scope.isConnected
        ? handoff.scope.querySelectorAll<HTMLElement>("button")
        : []),
      ...intake,
      handoff.focusRoot,
    ].find(
      (element): element is HTMLElement =>
        element != null && element.isConnected && isFocusable(element),
    ) ?? null
  );
}

function isFocusable(element: HTMLElement): boolean {
  return !(element instanceof HTMLButtonElement && element.disabled);
}

/**
 * Call options for files taken in by an upload part.
 *
 * Inside an `ObjectList` whose `upload` is this same hook (by
 * `instanceId`, so a capped copy from `UploadField` counts), the source's
 * `uploadOptions` for the open folder apply first, so files land in that
 * folder. `call` merges over them: its fields win, and `metadata` merges
 * key by key.
 */
export function useUploadCall(
  upload: UseUploadReturn,
  call: UploadCallOptions | undefined,
): UploadCallOptions | undefined {
  const objectList = useOptionalObjectListContext();
  const folderOptions =
    objectList?.upload?.instanceId === upload.instanceId
      ? objectList.list.uploadOptions?.(objectList.list.parent)
      : undefined;
  return folderOptions ? mergeCall(folderOptions, call) : call;
}

function mergeCall(
  base: UploadRequestOptions,
  call: UploadCallOptions | undefined,
): UploadCallOptions {
  const own = call?.uploadOptions;
  return {
    ...call,
    uploadOptions:
      typeof own === "function"
        ? (file) => mergeUploadRequest(base, own(file))
        : mergeUploadRequest(base, own),
  };
}
