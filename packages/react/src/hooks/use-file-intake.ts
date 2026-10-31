"use client";

import {
  useCallback,
  useRef,
  type ClipboardEvent,
  type DragEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  useDropzone,
  type DropEvent,
  type DropzoneInputProps,
  type DropzoneRootProps,
  type FileRejection as DropzoneFileRejection,
} from "react-dropzone";
import { useLiveRef } from "@/internal/hooks";
import type { UploadCallOptions } from "@/types/upload";

/** Call options, or a function that returns them when the files arrive. */
export type UploadCallInput = UploadCallOptions | (() => UploadCallOptions);

/**
 * Props for a drop target that is not a dropzone, such as a folder row.
 * While files are dragged over it, the element has a `data-drag-active`
 * attribute.
 */
export type DropTargetProps = Pick<
  HTMLAttributes<HTMLElement>,
  "onDragEnter" | "onDragOver" | "onDragLeave" | "onDrop"
> & { "data-drag-active"?: boolean };

/** Options for {@link useFileIntake}. */
export type UseFileIntakeOptions = {
  /** HTML `accept` tokens: MIME types (`image/*`) and extensions (`.pdf`). */
  accept?: readonly string[];
  /** Max files per selection. More than one allows a multiple selection. */
  maxFiles: number;
  /** Disables every intake interaction. */
  disabled?: boolean;
  /** Disables click-to-open on the root. */
  noClick?: boolean;
  /** Disables drag and drop on the root and on drop targets. */
  noDrag?: boolean;
  /** Disables keyboard activation on the root. */
  noKeyboard?: boolean;
  /**
   * Gets every picked, dropped or pasted file, with the call options of the
   * element that took them in. Files are not validated here.
   */
  onFiles: (files: File[], call: UploadCallOptions | undefined) => void;
};

/** What {@link useFileIntake} returns. */
export type UseFileIntakeReturn = {
  /** Spread on the dropzone root. `call` applies to its drops, pastes and picker. */
  getRootProps: <T extends DropzoneRootProps>(
    props?: T,
    call?: UploadCallInput,
  ) => T;
  /** Spread on a drop target. Adds drag and drop handlers only. */
  getDropTargetProps: <T extends object = DropTargetProps>(
    props?: T & DropTargetProps,
    call?: UploadCallInput,
  ) => T & DropTargetProps;
  /** Spread on a hidden `<input type="file">`. */
  getInputProps: <T extends DropzoneInputProps>(props?: T) => T;
  /** Opens the native file picker. `call` applies to the picked files. */
  open: (call?: UploadCallOptions) => void;
  isDragActive: boolean;
  isDragAccept: boolean;
  isDragReject: boolean;
};

type DragHandlerName = "onDragEnter" | "onDragOver" | "onDragLeave" | "onDrop";

const DRAG_HANDLERS: readonly DragHandlerName[] = [
  "onDragEnter",
  "onDragOver",
  "onDragLeave",
  "onDrop",
];

/**
 * Drag, drop and paste events already taken by an intake element. The
 * innermost element takes an event, so nested dropzones and drop targets
 * never handle the same files twice. Shared by every hook instance.
 */
const claimedEvents = new WeakSet<Event>();

/** The elements under each drop target that the current drag has entered. */
const enteredTargets = new WeakMap<Element, Set<EventTarget>>();

/** A validator that accepts every file. Set, it makes the drag verdict unknown. */
const acceptAll = () => null;

/**
 * @internal Headless file intake powered by react-dropzone, behind `useUpload`.
 *
 * It only collects files and the call options of the element that took them
 * in. `useUpload` validates them against the route policy, so a rejection
 * always carries a catalog error code. The drag state still reflects
 * `accept` and `maxFiles` while files are dragged.
 */
export function useFileIntake(
  options: UseFileIntakeOptions,
): UseFileIntakeReturn {
  const { accept, maxFiles } = options;
  const onFilesRef = useLiveRef(options.onFiles);
  // Call options per drop or paste event, and for the next picker selection.
  const eventCalls = useRef(new WeakMap<Event, UploadCallInput | undefined>());
  const pickerCall = useRef<UploadCallInput | undefined>(undefined);

  // Every file reaches `onFiles`, also the ones dropzone rejected, so that
  // `useUpload` reports one set of rejections with catalog codes.
  const onDrop = useCallback(
    (
      accepted: File[],
      rejections: DropzoneFileRejection[],
      event: DropEvent,
    ) => {
      const native = Array.isArray(event) ? null : nativeEventOf(event);
      const call =
        native !== null && eventCalls.current.has(native)
          ? eventCalls.current.get(native)
          : pickerCall.current;
      const files = [...accepted, ...rejections.map(({ file }) => file)];
      onFilesRef.current(files, resolveCall(call));
    },
    [onFilesRef],
  );

  const mimeAccept = toMimeAccept(accept);

  const dropzone = useDropzone({
    // During a drag the browser exposes MIME types but no file names, so
    // only a MIME-only list can be checked. Otherwise the validator makes
    // the drag verdict unknown instead of a false reject.
    accept: mimeAccept,
    validator: accept?.length && !mimeAccept ? acceptAll : undefined,
    maxFiles,
    multiple: maxFiles > 1,
    disabled: options.disabled,
    noClick: options.noClick,
    noDrag: options.noDrag,
    noKeyboard: options.noKeyboard,
    onDrop,
  });
  const {
    getRootProps: getDropzoneRootProps,
    getInputProps: getDropzoneInputProps,
    inputRef,
    open: openDropzone,
  } = dropzone;

  const htmlAccept =
    accept
      ?.map((token) => token.trim())
      .filter(Boolean)
      .join(",") || undefined;

  const getRootProps = useCallback(
    <T extends DropzoneRootProps>(props?: T, call?: UploadCallInput): T => {
      const {
        onClick,
        onKeyDown,
        onPaste,
        onDragEnter,
        onDragOver,
        onDragLeave,
        onDrop: onRootDrop,
        ...rest
      } = props ?? {};
      const root = getDropzoneRootProps<DropzoneRootProps>({
        ...rest,
        onClick: (event: MouseEvent<HTMLElement>) => {
          onClick?.(event);
          pickerCall.current = call;
        },
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
          onKeyDown?.(event);
          pickerCall.current = call;
        },
      });
      const dropzonePaste = root.onPaste;
      return {
        ...root,
        ...dragHandlers(
          { onDragEnter, onDragOver, onDragLeave, onDrop: onRootDrop },
          root,
          (event) => eventCalls.current.set(event.nativeEvent, call),
          false,
        ),
        // A paste whose default the consumer's handler prevented is theirs.
        onPaste: (event: ClipboardEvent<HTMLElement>) => {
          onPaste?.(event);
          if (!dropzonePaste || event.defaultPrevented) return;
          if (!claim(event.nativeEvent)) return;
          eventCalls.current.set(event.nativeEvent, call);
          dropzonePaste(event);
        },
      } as T;
    },
    [getDropzoneRootProps],
  );

  const getDropTargetProps = useCallback(
    <T extends object = DropTargetProps>(
      props?: T & DropTargetProps,
      call?: UploadCallInput,
    ): T & DropTargetProps =>
      ({
        ...props,
        // Only the drag handlers are used: no ref, role, tabIndex or click.
        ...dragHandlers(
          props ?? {},
          getDropzoneRootProps<DropzoneRootProps>(),
          (event) => eventCalls.current.set(event.nativeEvent, call),
          true,
        ),
      }) as T & DropTargetProps,
    [getDropzoneRootProps],
  );

  // Several inputs can share one hook, such as a list and the upload button in
  // its header. Dropzone's single object ref is cleared when any of them
  // unmounts, so track every input and open one that is still mounted.
  const inputsRef = useRef(new Set<HTMLInputElement>());
  const attachInput = useCallback(
    (node: HTMLInputElement | null) => {
      if (!node) return;
      inputsRef.current.add(node);
      inputRef.current = node;
    },
    [inputRef],
  );

  const getInputProps = useCallback(
    <T extends DropzoneInputProps>(props?: T): T =>
      ({
        ...getDropzoneInputProps({
          ...props,
          ...(htmlAccept != null ? { accept: htmlAccept } : {}),
        } as T),
        ref: attachInput,
      }) as T,
    [attachInput, getDropzoneInputProps, htmlAccept],
  );

  const open = useCallback(
    (call?: UploadCallOptions) => {
      pickerCall.current = call;
      const inputs = inputsRef.current;
      for (const node of inputs) {
        if (!node.isConnected) inputs.delete(node);
      }
      const ref = inputRef as { current: HTMLInputElement | null };
      if (!ref.current?.isConnected) ref.current = [...inputs].at(-1) ?? null;
      openDropzone();
    },
    [inputRef, openDropzone],
  );

  return {
    getRootProps,
    getDropTargetProps,
    getInputProps,
    open,
    isDragActive: dropzone.isDragActive,
    isDragAccept: dropzone.isDragAccept,
    isDragReject: dropzone.isDragReject,
  };
}

export type { DropzoneRootProps, DropzoneInputProps };

/**
 * Drag handlers that run the consumer's handler, then the dropzone's unless
 * an inner intake element already took the event. `onClaimDrop` runs when
 * this element takes a drop. With `trackTarget`, the element keeps a
 * `data-drag-active` attribute while files are over it. A disabled dropzone
 * has no handlers, so only the consumer's run.
 */
function dragHandlers(
  user: Pick<DropTargetProps, DragHandlerName>,
  dropzone: Pick<DropzoneRootProps, DragHandlerName>,
  onClaimDrop: (event: DragEvent<HTMLElement>) => void,
  trackTarget: boolean,
): Pick<DropTargetProps, DragHandlerName> {
  const handlers: Pick<DropTargetProps, DragHandlerName> = {};
  for (const name of DRAG_HANDLERS) {
    const own = user[name];
    // Typed as optional, but react-dropzone sets `null` when disabled.
    const dropzoneHandler = dropzone[name] ?? null;
    handlers[name] = dropzoneHandler
      ? (event) => {
          own?.(event);
          if (!claim(event.nativeEvent)) return;
          if (trackTarget) trackDragTarget(name, event);
          if (name === "onDrop") onClaimDrop(event);
          dropzoneHandler(event);
        }
      : own;
  }
  return handlers;
}

/** Takes `event` for the calling element. `false` when it was already taken. */
function claim(event: Event): boolean {
  if (claimedEvents.has(event)) return false;
  claimedEvents.add(event);
  return true;
}

/** Keeps `data-drag-active` on a drop target while files are over it. */
function trackDragTarget(name: DragHandlerName, event: DragEvent<HTMLElement>) {
  if (!hasFiles(event)) return;
  const element = event.currentTarget;
  const entered = enteredTargets.get(element) ?? new Set<EventTarget>();
  if (name === "onDragEnter") entered.add(event.target);
  if (name === "onDragLeave") entered.delete(event.target);
  if (name === "onDrop") entered.clear();
  if (entered.size > 0) {
    enteredTargets.set(element, entered);
    element.setAttribute("data-drag-active", "true");
  } else {
    enteredTargets.delete(element);
    element.removeAttribute("data-drag-active");
  }
}

/** Like react-dropzone: a drag carries files when a type or an item says so. */
function hasFiles({ dataTransfer }: DragEvent<HTMLElement>): boolean {
  return (
    Array.from(dataTransfer.types).includes("Files") ||
    Array.from(dataTransfer.items).some((item) => item.kind === "file")
  );
}

function nativeEventOf(event: Exclude<DropEvent, readonly unknown[]>): Event {
  return "nativeEvent" in event ? event.nativeEvent : event;
}

function resolveCall(
  call: UploadCallInput | undefined,
): UploadCallOptions | undefined {
  return typeof call === "function" ? call() : call;
}

/**
 * The dropzone `accept` map when every token is a MIME type, which is the
 * only kind a drag can check, or `undefined`.
 */
function toMimeAccept(
  accept: readonly string[] | undefined,
): Record<string, string[]> | undefined {
  const tokens = accept?.map((token) => token.trim()).filter(Boolean);
  if (!tokens?.length || tokens.some((token) => !token.includes("/"))) {
    return undefined;
  }
  return Object.fromEntries(tokens.map((token) => [token, []]));
}
