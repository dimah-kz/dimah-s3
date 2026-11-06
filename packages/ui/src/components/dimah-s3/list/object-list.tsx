"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  type FocusEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  AnyDownloadReturn,
  DeleteResult,
  DropTargetProps,
  ObjectListEntry,
  ObjectListFolder,
  UseDeleteReturn,
  UseDownloadReturn,
  UseObjectListReturn,
  UseObjectListSelectionReturn,
  UseUploadReturn,
} from "@dimah-s3/react";
import { objectKeyOf } from "@dimah-s3/react/engine";
import { useTranslations } from "@fuma-translate/react";
import { cn } from "cn";
import { Delete } from "@/components/dimah-s3/delete/delete";
import {
  useDeleteToasts,
  type DeleteToastMessage,
} from "@/components/dimah-s3/delete/delete-toasts";
import { Download } from "@/components/dimah-s3/download/download";
import { BuiltInDownloadToasts } from "@/components/dimah-s3/download/download-toasts";
import { ObjectListContent } from "@/components/dimah-s3/list/object-list-content";
import {
  ObjectListAnnouncer,
  useObjectListAnnouncement,
} from "@/components/dimah-s3/list/object-list-feedback";
import {
  createObjectListEntryStore,
  ObjectListProvider,
  useObjectListContext,
  useObjectListEntryScope,
  type ObjectListContextValue,
  type ObjectListEntryScope,
  type ObjectListPagination,
  type ObjectListRenderers,
  type ObjectListView,
} from "@/components/dimah-s3/list/object-list-context";
import {
  ObjectListHeader,
  useSelectionCount,
} from "@/components/dimah-s3/list/object-list-header";
import { useObjectListKeyboard } from "@/components/dimah-s3/list/object-list-keyboard";
import { canRenameEntry } from "@/components/dimah-s3/list/object-list-rename";
import {
  folderUploadCall,
  ObjectListDropOverlay,
  ObjectListUploadStatus,
  useRefreshListAfterUpload,
} from "@/components/dimah-s3/list/object-list-upload";
import { ObjectListUsage } from "@/components/dimah-s3/list/object-list-usage";
import { Upload } from "@/components/dimah-s3/upload/upload";
import { BuiltInUploadToasts } from "@/components/dimah-s3/upload/upload-toasts";
import { useOwnDrag } from "@/hooks/use-own-drag";
import { isFieldTarget } from "@/lib/is-field-target";

/** Props for {@link ObjectList}. */
export type ObjectListProps<TItem> = ObjectListRenderers<TItem> & {
  /** `useObjectList` return. The component renders it and does not fetch. */
  list: UseObjectListReturn<TItem>;
  /**
   * `useObjectListSelection` return. Adds checkboxes, the selection bar,
   * Ctrl+A / Cmd+A, Escape, Space, and Shift ranges.
   */
  selection?: UseObjectListSelectionReturn<TItem>;
  /**
   * `useUpload`. Drop or paste files onto the list to upload them into the
   * open folder. When the source has `uploadOptions`, files go where it
   * says, folder rows take drops, and their menu has Upload to this folder.
   * `UploadTrigger` and `UploadDropzone` inside the list use the same hook
   * and folder without their own `Upload`. The list reloads once each time
   * the queue settles with new uploads.
   */
  upload?: UseUploadReturn;
  /**
   * `useDownload` or `useFetchDownload`. Adds Download to the file menu.
   * `DownloadTrigger` inside the list uses it without its own `Download`.
   */
  download?: AnyDownloadReturn;
  /**
   * Navigate-mode `useDownload` for Copy link, such as one with
   * `disposition: "inline"`. Falls back to a navigate-mode `download`.
   */
  share?: UseDownloadReturn;
  /**
   * `useDelete`. Adds Delete to the file menu and to the selection bar,
   * with one confirmation for the whole list. `DeleteTrigger` inside the
   * list uses it too. Deleted files leave the rows at once; the list then
   * reloads.
   */
  delete?: UseDeleteReturn;
  /**
   * Show toasts for `upload`, `download`, and `delete`. They step aside for
   * an `UploadToasts`, `DownloadToasts`, or `DeleteToasts` you mount for the
   * same hook. Off, delete results and the list's own controls (Copy link,
   * bulk Delete) report in a polite live region instead, unless you mount a
   * `DeleteToasts` for the same hook. @default true
   */
  toasts?: boolean;
  /** Controlled view. Pass it with `onViewChange`. */
  view?: ObjectListView;
  /** Uncontrolled starting view. @default "list" */
  defaultView?: ObjectListView;
  onViewChange?: (view: ObjectListView) => void;
  /**
   * Called when a file row is clicked or activated with Enter.
   * Folders always open in place.
   */
  onOpenItem?: (item: TItem) => void;
  /**
   * Object keys stored in a folder. Selected folders join a bulk delete
   * only when this is set. Pair it with `isSelectable` on the selection.
   */
  resolveFolderKeys?: (folder: ObjectListFolder) => Promise<readonly string[]>;
  /** Called after each confirmed delete in the list, with every key's outcome. */
  onDeleted?: (result: DeleteResult) => void;
  /** Root breadcrumb label and the list's accessible name. @default "Files" */
  rootLabel?: string;
  /** Show the path in the default header. @default true */
  breadcrumb?: boolean;
  /** Trailing controls in the default header, such as an upload button. */
  toolbar?: ReactNode;
  /** Extra controls on the selection bar, beside Delete. */
  selectionActions?: ReactNode;
  /** Replaces the empty state. `ObjectListEmpty` takes your own text. */
  empty?: ReactNode;
  /**
   * How later pages load. `auto` loads the next page as the end of the
   * rows comes into view; `button` waits for Load more. @default "auto"
   */
  pagination?: ObjectListPagination;
  /**
   * Fixed frame height. The header stays put and the rows scroll inside.
   * A number is pixels. A string is a CSS length, such as `"18rem"`.
   */
  height?: number | string;
  /**
   * Largest frame height. The list grows with its rows until this cap,
   * then the rows scroll and the header stays put.
   */
  maxHeight?: number | string;
  className?: string;
  /**
   * Your own layout from the list parts. Omit it for the default:
   * header, usage, upload status, and content.
   */
  children?: ReactNode;
};

/**
 * File and folder catalog for a `useObjectList` return.
 *
 * Works on its own: pass `list`, then the hooks you have — `selection`,
 * `upload`, `download`, `share`, `delete` — to switch features on. Use the
 * `render*` props to change parts of each entry, or pass `children` to
 * arrange the parts (`ObjectListHeader`, `ObjectListSearch`,
 * `ObjectListContent`, …) yourself.
 *
 * The list is the `Upload`, `Download`, and `Delete` root for its hooks,
 * so the family parts work inside it, and one delete confirmation serves
 * every row and the selection bar.
 */
export function ObjectList<TItem>({
  list,
  selection,
  upload,
  download,
  share,
  delete: del,
  toasts = true,
  view: viewProp,
  defaultView = "list",
  onViewChange,
  onOpenItem,
  resolveFolderKeys,
  onDeleted,
  rootLabel,
  breadcrumb = true,
  toolbar,
  selectionActions,
  empty,
  pagination = "auto",
  height,
  maxHeight,
  className,
  children,
  renderEntry,
  renderActions,
  renderDescription,
  renderMeta,
}: ObjectListProps<TItem>) {
  const t = useTranslations();
  const [localView, setLocalView] = useState(defaultView);
  const view = viewProp ?? localView;
  useRefreshListAfterUpload(upload, list.refresh);
  const deleteFocus = useFocusAfterDelete();
  const { announcement, announce } = useObjectListAnnouncement();
  const selectionCount = useSelectionCount(list, selection ?? null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const renameFocusKey = useRef<string | null>(null);
  const previousRenaming = useRef<string | null>(null);
  // The row left the page (another folder, a search). Drop the field.
  if (
    renamingKey != null &&
    !list.entries.some((entry) => entry.key === renamingKey)
  ) {
    setRenamingKey(null);
  }

  useEffect(() => {
    const previous = previousRenaming.current;
    previousRenaming.current = renamingKey;
    if (previous == null || renamingKey != null) return;
    const focusKey = renameFocusKey.current;
    renameFocusKey.current = null;
    if (focusKey !== previous) return;
    deleteFocus.frameRef.current
      ?.querySelector<HTMLElement>(
        `[data-slot="object-list-entry-trigger"][data-entry-key="${CSS.escape(previous)}"]`,
      )
      ?.focus();
  }, [deleteFocus.frameRef, renamingKey]);

  const frameHeight = cssLength(height);
  const frameMaxHeight = cssLength(maxHeight);
  const sizing =
    frameHeight != null ? "fixed" : frameMaxHeight != null ? "max" : null;
  const label = rootLabel ?? t("Files", { note: "object list" });

  // What the entries draw from. Per-entry state goes through the store, so
  // a selection or an arrow key draws only the entries it changes. What can
  // be selected changes with the entries, so it goes with the scope below.
  const selectableKeys = useSelectableKeys(list.entries, selection ?? null);
  const selectedKeys = selection?.selectedKeys ?? NO_KEYS;
  const selecting = selection?.isSelecting === true;
  const [store] = useState(() =>
    createObjectListEntryStore({
      selected: selectedKeys,
      selecting,
      renaming: null,
      tabStop: list.entries[0]?.key ?? null,
    }),
  );
  useLayoutEffect(() => {
    const { tabStop } = store.get();
    store.set({
      selected: selectedKeys,
      selecting,
      renaming: renamingKey,
      // The entry that had the tab stop left: the first one takes it.
      tabStop:
        tabStop != null && list.entries.some((entry) => entry.key === tabStop)
          ? tabStop
          : (list.entries[0]?.key ?? null),
    });
  }, [list.entries, renamingKey, selectedKeys, selecting, store]);

  // Commands read the newest props when they run, so they never change.
  const latest = useRef({
    list,
    selection,
    upload,
    onOpenItem,
    viewProp,
    onViewChange,
  });
  useLayoutEffect(() => {
    latest.current = {
      list,
      selection,
      upload,
      onOpenItem,
      viewProp,
      onViewChange,
    };
  });
  const setView = useCallback((next: ObjectListView) => {
    if (latest.current.viewProp === undefined) setLocalView(next);
    latest.current.onViewChange?.(next);
  }, []);
  // The entry's field opens and closes in the same render as the list, so
  // focus that follows a rename finds the row as it now is.
  const startRename = useCallback(
    (key: string) => {
      const current = latest.current.list;
      const target = current.entries.find((entry) => entry.key === key);
      if (!target || !canRenameEntry(target, current)) return;
      setRenamingKey(key);
      store.set({ renaming: key });
    },
    [store],
  );
  const endRename = useCallback(
    (key: string, focus = false) => {
      if (focus) renameFocusKey.current = key;
      // A save that lands after another rename started leaves that one open.
      setRenamingKey((current) => (current === key ? null : current));
      if (store.get().renaming === key) store.set({ renaming: null });
    },
    [store],
  );
  const open = useCallback((entry: ObjectListEntry<TItem>) => {
    const current = latest.current;
    if (entry.kind === "folder") current.list.openFolder(entry.folder);
    else current.onOpenItem?.(entry.item);
  }, []);
  const toggle = useCallback(
    (key: string, options?: { range?: boolean; value?: boolean }) => {
      latest.current.selection?.toggle(key, options);
    },
    [],
  );
  const folderDropTarget = useCallback((id: string): DropTargetProps => {
    // The upload hook's handlers follow its state, so each event asks for
    // the current ones instead of keeping those of the row's last render.
    const handler =
      (name: DragHandlerName) => (event: DragEvent<HTMLElement>) => {
        const current = latest.current;
        current.upload
          ?.getDropTargetProps(
            {},
            () => folderUploadCall(current.list, id) ?? {},
          )
          [name]?.(event);
      };
    return {
      onDragEnter: handler("onDragEnter"),
      onDragOver: handler("onDragOver"),
      onDragLeave: handler("onDragLeave"),
      onDrop: handler("onDrop"),
    };
  }, []);

  const context = useMemo<ObjectListContextValue<TItem>>(
    () => ({
      list,
      selection: selection ?? null,
      upload: upload ?? null,
      download: download ?? null,
      share: share ?? null,
      delete: del ?? null,
      toasts,
      announce,
      view,
      setView,
      label,
      sizing,
      showBreadcrumb: breadcrumb,
      selectionActions,
      empty,
      pagination,
      onOpenItem,
      resolveFolderKeys,
      renamingKey,
      startRename,
      endRename,
      renderEntry,
      renderActions,
      renderDescription,
      renderMeta,
    }),
    [
      announce,
      breadcrumb,
      del,
      download,
      empty,
      endRename,
      label,
      list,
      onOpenItem,
      pagination,
      renamingKey,
      renderActions,
      renderDescription,
      renderEntry,
      renderMeta,
      resolveFolderKeys,
      selection,
      selectionActions,
      setView,
      share,
      sizing,
      startRename,
      toasts,
      upload,
      view,
    ],
  );

  const opensFiles = onOpenItem != null;
  const folderUploads = upload != null && list.uploadOptions != null;
  const canDownload = download != null;
  const canShare = share != null || download?.mode === "navigate";
  const canDelete = del != null;
  const renameFile = list.renameFile != null;
  const renameFolder = list.renameFolder != null;
  const scope = useMemo<ObjectListEntryScope<TItem>>(
    () => ({
      store,
      selectable: selectableKeys,
      opensFiles,
      folderUploads,
      download: canDownload,
      share: canShare,
      delete: canDelete,
      renameFile,
      renameFolder,
      open,
      toggle,
      folderDropTarget,
      startRename,
      endRename,
      renderActions,
      renderDescription,
      renderMeta,
    }),
    [
      canDelete,
      canDownload,
      canShare,
      endRename,
      folderDropTarget,
      folderUploads,
      open,
      opensFiles,
      renameFile,
      renameFolder,
      renderActions,
      renderDescription,
      renderMeta,
      selectableKeys,
      startRename,
      store,
      toggle,
    ],
  );

  /** Drops deleted files from the rows and the selection, then reloads. */
  function handleDeleted(result: DeleteResult) {
    if (result.deleted.length > 0) {
      const gone = new Set(result.deleted);
      deleteFocus.prepare(
        list.entries.flatMap((entry) =>
          entry.kind === "file" && gone.has(objectKeyOf(entry))
            ? [entry.key]
            : [],
        ),
      );
      list.setItems((items) =>
        items.filter(
          (item) =>
            !gone.has(
              objectKeyOf({ id: list.getKey(item), file: list.getFile(item) }),
            ),
        ),
      );
      // A persisted selection keeps entries that are no longer loaded.
      selection?.deselect(
        selection.selected.flatMap((entry) =>
          entry.kind === "file" && gone.has(objectKeyOf(entry))
            ? [entry.key]
            : [],
        ),
      );
      void list.refresh();
    }
    onDeleted?.(result);
  }

  let content: ReactNode = (
    <ObjectListFrame
      frameRef={deleteFocus.frameRef}
      onFocus={deleteFocus.onFrameFocus}
      className={className}
      style={{
        ...(frameHeight != null ? { height: frameHeight } : {}),
        ...(frameMaxHeight != null ? { maxHeight: frameMaxHeight } : {}),
      }}
    >
      {children ?? (
        <>
          {breadcrumb ||
          toolbar != null ||
          selection != null ||
          list.createFolder != null ? (
            <ObjectListHeader>{toolbar}</ObjectListHeader>
          ) : null}
          <ObjectListUsage />
          <ObjectListUploadStatus />
          <ObjectListContent />
        </>
      )}
    </ObjectListFrame>
  );
  if (del) {
    content = (
      <Delete
        delete={del}
        onDeleted={handleDeleted}
        restoreFocus={deleteFocus.restoreFocus}
      >
        {content}
      </Delete>
    );
  }
  if (download) content = <Download download={download}>{content}</Download>;
  if (upload) content = <Upload upload={upload}>{content}</Upload>;

  return (
    <ObjectListProvider value={context} scope={scope}>
      {content}
      {toasts ? (
        <>
          {upload ? <BuiltInUploadToasts upload={upload} /> : null}
          {download ? <BuiltInDownloadToasts download={download} /> : null}
          {del ? <ObjectListDeleteToasts delete={del} /> : null}
        </>
      ) : del ? (
        <ObjectListDeleteToasts delete={del} report={announce} />
      ) : null}
      {/* Mounted from the start, so the first change is read out. */}
      <ObjectListAnnouncer
        announcement={announcement}
        status={selectionCount}
      />
    </ObjectListProvider>
  );
}

const NO_KEYS: ReadonlySet<string> = new Set();

/**
 * Keys of the loaded entries `selection` can select. The same set while
 * they stay the same, also with an inline `isSelectable`.
 */
function useSelectableKeys<TItem>(
  entries: readonly ObjectListEntry<TItem>[],
  selection: UseObjectListSelectionReturn<TItem> | null,
): ReadonlySet<string> {
  const keys = selection
    ? entries.flatMap((entry) =>
        selection.canSelect(entry) ? [entry.key] : [],
      )
    : [];
  const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set(keys));
  if (kept.size === keys.length && keys.every((key) => kept.has(key))) {
    return kept;
  }
  const next = new Set(keys);
  setKept(next);
  return next;
}

/**
 * Where focus goes after a delete in the list. Once the control that asked
 * is gone (its row, or the selection bar), focus moves to the entry that
 * took the place of the first deleted one, else the one before it. The
 * `Delete` root falls back to the frame.
 */
function useFocusAfterDelete() {
  const frameRef = useRef<HTMLElement>(null);
  /** The element in the frame that last had focus: the delete's control. */
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const nextRef = useRef<HTMLElement | null>(null);

  return {
    frameRef,
    onFrameFocus(event: FocusEvent<HTMLElement>) {
      // Menus are portalled: their focus bubbles through React only.
      if (event.currentTarget.contains(event.target)) {
        lastFocusRef.current = event.target;
      }
    },
    /** Call with the entry keys a delete removes, while they still render. */
    prepare(removedKeys: readonly string[]) {
      nextRef.current = entryAfter(frameRef.current, new Set(removedKeys));
    },
    restoreFocus(): HTMLElement | null {
      const next = nextRef.current;
      nextRef.current = null;
      // A control that is still there, such as the selection bar's Delete,
      // keeps focus.
      return lastFocusRef.current?.isConnected ? null : next;
    },
  };
}

/** The first entry trigger after the first removed one, else the last before it. */
function entryAfter(
  frame: HTMLElement | null,
  removed: ReadonlySet<string>,
): HTMLElement | null {
  if (!frame || removed.size === 0) return null;
  const triggers = [
    ...frame.querySelectorAll<HTMLElement>(
      "[data-slot=object-list-entry-trigger]",
    ),
  ];
  const isRemoved = (trigger: HTMLElement) =>
    removed.has(trigger.dataset.entryKey ?? "");
  const first = triggers.findIndex(isRemoved);
  if (first < 0) return null;
  return (
    triggers.slice(first).find((trigger) => !isRemoved(trigger)) ??
    triggers
      .slice(0, first)
      .reverse()
      .find((trigger) => !isRemoved(trigger)) ??
    null
  );
}

/**
 * The bordered frame: drop target, paste target, keyboard scope, and the
 * place focus returns to when no entry can take it after a delete.
 */
function ObjectListFrame({
  frameRef,
  onFocus,
  className,
  style,
  children,
}: {
  frameRef: RefObject<HTMLElement | null>;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  className?: string;
  style: CSSProperties;
  children: ReactNode;
}) {
  const { list, selection, upload, view, label, sizing, startRename } =
    useObjectListContext();
  const { store } = useObjectListEntryScope();
  const keyboard = useObjectListKeyboard({
    list,
    selection,
    view,
    store,
    startRename,
  });
  const busy = list.isLoading || list.isRefreshing || list.isLoadingMore;
  const call = folderUploadCall(list, list.parent);
  // A disabled hook ignores drops; the frame then ignores drags and pastes.
  const takesFiles = upload != null && !upload.disabled;
  // The hook's drag state covers all of its drop targets, so the frame
  // highlights and speaks only while the drag is over the frame itself.
  const drag = useOwnDrag();
  const dragActive = upload?.isDragActive === true && drag.over;
  // A folder row or a dropzone inside the list takes the drag, so the
  // frame's overlay steps aside. A dropzone announces itself; for a folder
  // row the frame announces the folder by name.
  const [innerTarget, setInnerTarget] = useState<InnerDropTarget | null>(null);
  const [dropFolder, setDropFolder] = useState<string | null>(null);

  function trackDragTarget(event: DragEvent<HTMLElement>) {
    const inner =
      event.target instanceof Element
        ? event.target.closest(INNER_DROP_TARGET)
        : null;
    if (inner == null || !event.currentTarget.contains(inner)) {
      setInnerTarget(null);
      setDropFolder(null);
      return;
    }
    const dropzone = inner.matches(DROPZONE);
    setInnerTarget(dropzone ? "dropzone" : "folder");
    setDropFolder(dropzone ? null : inner.getAttribute("data-drop-name"));
  }

  function onPaste(event: ClipboardEvent<HTMLElement>) {
    // A dropzone inside the list takes its own pastes.
    if (!takesFiles || event.defaultPrevented || isFieldTarget(event.target)) {
      return;
    }
    const files = [...event.clipboardData.files];
    if (files.length === 0) return;
    event.preventDefault();
    void upload.handleFiles(files, call);
  }

  const frameProps = {
    "data-slot": "object-list",
    "data-view": view,
    "data-dimah-s3-focus-root": "",
    "aria-label": label,
    "aria-busy": busy || undefined,
    tabIndex: -1,
    ref: frameRef,
    className: cn(
      "group/object-list relative flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-dimah-s3-border bg-dimah-s3-card text-dimah-s3-card-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-dimah-s3-ring/50",
      sizing && "min-h-0",
      dragActive &&
        upload.isDragReject &&
        "border-dimah-s3-destructive bg-dimah-s3-destructive/5",
      dragActive &&
        upload.isDragAccept &&
        "border-dimah-s3-primary bg-dimah-s3-primary/5",
      dragActive &&
        !upload.isDragAccept &&
        !upload.isDragReject &&
        "border-dimah-s3-primary/50",
      className,
    ),
    style,
    onFocus: (event: FocusEvent<HTMLElement>) => {
      onFocus(event);
      keyboard.onFocus(event);
    },
    onPaste,
    onDragEnter: (event: DragEvent<HTMLElement>) => {
      if (!takesFiles) return;
      drag.enter(event);
      trackDragTarget(event);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (takesFiles) trackDragTarget(event);
    },
    onDragLeave: drag.leave,
    onDrop: () => {
      drag.end();
      setInnerTarget(null);
      setDropFolder(null);
    },
    // Keys come from the entries inside; the frame only routes them.
    onKeyDown: keyboard.onKeyDown,
    onKeyUp: keyboard.onKeyUp,
  };

  return (
    <section
      {...(upload ? upload.getDropTargetProps(frameProps, call) : frameProps)}
    >
      {children}
      {upload ? (
        <ObjectListDropOverlay
          upload={upload}
          active={dragActive}
          target={innerTarget ?? "frame"}
          folder={dropFolder}
        />
      ) : null}
    </section>
  );
}

/** Drop targets inside the frame that take a drag for themselves. */
type InnerDropTarget = "folder" | "dropzone";

type DragHandlerName = "onDragEnter" | "onDragOver" | "onDragLeave" | "onDrop";

const DROPZONE = "[data-slot=upload-dropzone]:not([data-disabled])";
const INNER_DROP_TARGET = `[data-slot=object-list-entry][data-drag-active], ${DROPZONE}`;

/**
 * Delete toasts that step aside for an explicit `DeleteToasts`. With
 * `report`, the same messages go there instead, such as the list's live
 * region while its toasts are off.
 */
function ObjectListDeleteToasts({
  delete: del,
  report,
}: {
  delete: UseDeleteReturn;
  report?: (message: DeleteToastMessage) => void;
}) {
  useDeleteToasts(del, { weak: true, report });
  return null;
}

/** A number is pixels. A blank string is unset. */
function cssLength(value: number | string | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
