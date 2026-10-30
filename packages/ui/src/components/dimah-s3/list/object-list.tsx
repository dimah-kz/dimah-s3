"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  objectKeyOf,
  type ObjectListFileEntry,
  type ObjectListFolder,
  type UseDeleteReturn,
  type UseNavigateDownloadReturn,
  type UseObjectListReturn,
  type UseObjectListSelectionReturn,
  type UseUploadReturn,
} from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { cn } from "cn";
import { ObjectListContent } from "@/components/dimah-s3/list/object-list-content";
import {
  ObjectListProvider,
  useObjectListContext,
  type ObjectListContextValue,
  type ObjectListDeleteResult,
  type ObjectListRenderers,
  type ObjectListUsageLimits,
  type ObjectListView,
} from "@/components/dimah-s3/list/object-list-context";
import { ObjectListHeader } from "@/components/dimah-s3/list/object-list-header";
import {
  ObjectDeleteDialog,
  ObjectDownloadToasts,
} from "@/components/dimah-s3/list/object-list-item-menu";
import {
  isFieldTarget,
  useObjectListKeyboard,
} from "@/components/dimah-s3/list/object-list-keyboard";
import {
  ObjectListDropOverlay,
  ObjectListUploadStatus,
  useRefreshListAfterUpload,
} from "@/components/dimah-s3/list/object-list-upload";
import { ObjectListUsage } from "@/components/dimah-s3/list/object-list-usage";

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
   * `useUpload` with `noClick` and `noKeyboard`. Drop or paste files onto
   * the list to upload into the open folder. `getUploadOptions` reads
   * `list.parent`; the list does not write metadata. When a batch settles
   * with at least one success, the list reloads once. The list renders the
   * hook's file input, so `upload.open()` from any trigger opens the picker.
   */
  upload?: UseUploadReturn;
  /** Navigate-mode `useDownload`. Adds Download to the file menu. */
  download?: UseNavigateDownloadReturn;
  /**
   * Navigate-mode `useDownload` for Copy link, such as one with
   * `disposition: "inline"`. Falls back to `download`.
   */
  share?: UseNavigateDownloadReturn;
  /**
   * `useDelete`. Adds Delete to the file menu and to the selection bar.
   * Deleted files leave the rows at once; the list then reloads.
   */
  delete?: UseDeleteReturn;
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
  /** Called after a delete from the file menu or the selection bar. */
  onDeleted?: (result: ObjectListDeleteResult) => void;
  /** Root breadcrumb label and the list's accessible name. @default "Files" */
  rootLabel?: string;
  /** Show the path in the default header. @default true */
  breadcrumb?: boolean;
  /** Trailing controls in the default header, such as an upload button. */
  toolbar?: ReactNode;
  /** Extra controls on the selection bar, beside Delete. */
  selectionActions?: ReactNode;
  /** Caps drawn next to `list.usage`. */
  usageLimits?: ObjectListUsageLimits;
  /** Replaces the empty state. `ObjectListEmpty` takes your own text. */
  empty?: ReactNode;
  /**
   * `auto` loads the next page as the end of the rows comes into view.
   * `button` waits for Load more. @default "auto"
   */
  loadMore?: "auto" | "button";
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
 */
export function ObjectList<TItem>({
  list,
  selection,
  upload,
  download,
  share,
  delete: remove,
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
  usageLimits,
  empty,
  loadMore = "auto",
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

  const frameHeight = cssLength(height);
  const frameMaxHeight = cssLength(maxHeight);

  const context: ObjectListContextValue<TItem> = {
    list,
    selection: selection ?? null,
    upload: upload ?? null,
    download: download ?? null,
    share: share ?? null,
    remove: remove ?? null,
    view,
    setView(next) {
      if (viewProp === undefined) setLocalView(next);
      onViewChange?.(next);
    },
    label: rootLabel ?? t("Files", { note: "object list" }),
    sizing:
      frameHeight != null ? "fixed" : frameMaxHeight != null ? "max" : null,
    showBreadcrumb: breadcrumb,
    selectionActions,
    usageLimits,
    empty,
    loadMore,
    onOpenItem,
    resolveFolderKeys,
    renderEntry,
    renderActions,
    renderDescription,
    renderMeta,
    afterDelete(result) {
      if (result.deleted.length > 0) {
        const gone = new Set(result.deleted);
        list.setItems((items) =>
          items.filter(
            (item) =>
              !gone.has(
                objectKeyOf({
                  id: list.getKey(item),
                  file: list.getFile(item),
                }),
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
    },
  };

  return (
    <ObjectListProvider value={context}>
      <ObjectListFrame
        className={className}
        style={{
          ...(frameHeight != null ? { height: frameHeight } : {}),
          ...(frameMaxHeight != null ? { maxHeight: frameMaxHeight } : {}),
        }}
      >
        {children ?? (
          <>
            {breadcrumb || toolbar != null || selection != null ? (
              <ObjectListHeader>{toolbar}</ObjectListHeader>
            ) : null}
            <ObjectListUsage />
            <ObjectListUploadStatus />
            <ObjectListContent />
          </>
        )}
      </ObjectListFrame>
      <ObjectListTransfers />
    </ObjectListProvider>
  );
}

/** The bordered frame: drop target, paste target, and keyboard scope. */
function ObjectListFrame({
  className,
  style,
  children,
}: {
  className?: string;
  style: CSSProperties;
  children: ReactNode;
}) {
  const { list, selection, upload, view, label, sizing } =
    useObjectListContext();
  const keyboard = useObjectListKeyboard({ list, selection, view });
  const busy = list.isLoading || list.isRefreshing || list.isLoadingMore;

  function onPaste(event: ClipboardEvent<HTMLElement>) {
    if (!upload || isFieldTarget(event.target)) return;
    const files = [...event.clipboardData.files];
    if (files.length === 0) return;
    event.preventDefault();
    void upload.handleFiles(files);
  }

  const frameProps = {
    "data-slot": "object-list",
    "data-view": view,
    "aria-label": label,
    "aria-busy": busy || undefined,
    className: cn(
      "relative flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-dimah-s3-border bg-dimah-s3-card text-dimah-s3-card-foreground transition-colors",
      sizing && "min-h-0",
      upload?.isDragReject &&
        "border-dimah-s3-destructive bg-dimah-s3-destructive/5",
      upload?.isDragAccept && "border-dimah-s3-primary bg-dimah-s3-primary/5",
      upload?.isDragActive &&
        !upload.isDragAccept &&
        !upload.isDragReject &&
        "border-dimah-s3-primary/50",
      className,
    ),
    style,
    onPaste,
  };

  const sectionProps = {
    ...(upload
      ? upload.getRootProps({
          ...frameProps,
          role: "region",
          tabIndex: undefined,
          "aria-disabled": undefined,
          onClick: (event) => {
            event.stopPropagation();
          },
        })
      : frameProps),
    // After the dropzone props: with `noKeyboard` it drops `onKeyDown`.
    // Keys come from the entries inside; the frame only routes them.
    onKeyDown: keyboard.onKeyDown,
    onKeyUp: keyboard.onKeyUp,
  };

  return (
    <section {...sectionProps}>
      {children}
      {upload ? (
        <>
          <input {...upload.getInputProps()} />
          <ObjectListDropOverlay upload={upload} />
        </>
      ) : null}
    </section>
  );
}

/**
 * One delete confirmation and one set of transfer toasts for the whole list,
 * whichever row asked.
 */
function ObjectListTransfers() {
  const { list, remove, download, afterDelete } = useObjectListContext();
  const deleting = findLoadedFile(list, remove?.objectKey);
  const downloading = findLoadedFile(list, download?.objectKey);
  useSingleDeleteSettled(remove, afterDelete);

  return (
    <>
      {remove ? (
        <ObjectDeleteDialog
          remove={remove}
          target={
            remove.objectKey
              ? {
                  objectKey: remove.objectKey,
                  fileName: deleting?.file.name,
                  fileSize: deleting?.file.size,
                }
              : null
          }
        />
      ) : null}
      {download ? (
        <ObjectDownloadToasts
          download={download}
          objectKey={download.objectKey ?? ""}
          fileName={downloading?.file.name}
          fileSize={downloading?.file.size ?? undefined}
        />
      ) : null}
    </>
  );
}

/** The loaded file whose object key is `objectKey`. */
function findLoadedFile<TItem>(
  list: UseObjectListReturn<TItem>,
  objectKey: string | null | undefined,
): ObjectListFileEntry<TItem> | null {
  if (!objectKey) return null;
  for (const entry of list.entries) {
    if (entry.kind === "file" && objectKeyOf(entry) === objectKey) return entry;
  }
  return null;
}

/** Hands a finished single-file delete to the list once. */
function useSingleDeleteSettled(
  remove: UseDeleteReturn | null,
  afterDelete: (result: ObjectListDeleteResult) => void,
) {
  const afterDeleteRef = useRef(afterDelete);
  const settledRef = useRef<string | null>(null);
  const phase = remove?.phase;
  const objectKey = remove?.objectKey ?? null;

  useEffect(() => {
    afterDeleteRef.current = afterDelete;
  });

  useEffect(() => {
    const settled = phase === "success" || phase === "error";
    if (!settled || objectKey == null) {
      settledRef.current = null;
      return;
    }
    const token = `${phase}:${objectKey}`;
    if (settledRef.current === token) return;
    settledRef.current = token;
    afterDeleteRef.current(
      phase === "success"
        ? { deleted: [objectKey], failed: [] }
        : { deleted: [], failed: [objectKey] },
    );
  }, [objectKey, phase]);
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
