"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type RefObject,
} from "react";
import {
  useFormatError,
  useFormatNumber,
  type DropTargetProps,
  type ObjectListEntry,
  type ObjectListFolder,
} from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { ChevronRightIcon, FolderInputIcon, HomeIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { FolderGlyph } from "@/components/dimah-s3/attachment/folder-glyph";
import { useObjectListContext } from "@/components/dimah-s3/list/object-list-context";
import { useObjectListFeedback } from "@/components/dimah-s3/list/object-list-feedback";
import { isolateText } from "@/lib/isolate-text";

const FOCUS_ROOT = "[data-dimah-s3-focus-root]";

/** Where entries go: a folder, or `null` for the root. */
export type ObjectListMoveDestination = ObjectListFolder | null;

/** Moves entries, then reports how it went. @internal */
export type ObjectListMoveFn<TItem> = (
  entries: readonly ObjectListEntry<TItem>[],
  destination: ObjectListMoveDestination,
) => Promise<void>;

/** What the Move dialog is open for. @internal */
export type ObjectListMoveRequest<TItem> = {
  entries: readonly ObjectListEntry<TItem>[];
  /** The control that opened the dialog. Focus returns to it. */
  trigger: HTMLElement | null;
};

/** The drag type of entries moved inside one list. @internal */
export const OBJECT_LIST_MOVE_TYPE = "application/x-dimah-s3-entries";

/** `true` while the drag carries entries of a list, not files. @internal */
export function isMoveDrag(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes(OBJECT_LIST_MOVE_TYPE);
}

/** Highlight while dragged entries are over a folder they can move into. */
export const MOVE_TARGET =
  "data-move-over:bg-dimah-s3-primary/10 data-move-over:ring-2 data-move-over:ring-dimah-s3-primary data-move-over:ring-inset";

/**
 * Moves entries with the list's `moveEntries`, then reports what moved
 * and what failed. Moved entries leave the selection. @internal
 */
export function useObjectListMove<TItem>(): ObjectListMoveFn<TItem> {
  const t = useTranslations();
  const formatError = useFormatError();
  const formatNumber = useFormatNumber();
  const report = useObjectListFeedback();
  const { list, selection, rootLabel } = useObjectListContext<TItem>();
  const { moveEntries } = list;

  return useCallback(
    async (
      entries: readonly ObjectListEntry<TItem>[],
      destination: ObjectListMoveDestination,
    ) => {
      if (!moveEntries) return;
      const { moved, failed } = await moveEntries(
        entries,
        destination?.id ?? null,
      );
      if (moved.length > 0) {
        selection?.deselect(moved.map((entry) => entry.key));
        const folder = isolateText(destination?.name ?? rootLabel);
        const [first] = moved;
        report({
          type: "success",
          title:
            moved.length === 1 && first
              ? t('Moved "{name}" to "{folder}"', {
                  note: "object list move",
                  variables: { name: isolateText(first.name), folder },
                })
              : t('Moved {count} items to "{folder}"', {
                  note: "object list move",
                  variables: { count: formatNumber(moved.length), folder },
                }),
        });
      }
      const [failure] = failed;
      if (failure) {
        report({
          type: "error",
          title:
            failed.length === 1
              ? t('Could not move "{name}"', {
                  note: "object list move",
                  variables: { name: isolateText(failure.entry.name) },
                })
              : t("Could not move {count} items", {
                  note: "object list move",
                  variables: { count: formatNumber(failed.length) },
                }),
          description: (
            <span className="block [overflow-wrap:anywhere]">
              {formatError(failure.error)}
            </span>
          ),
        });
      }
    },
    [formatError, formatNumber, moveEntries, report, rootLabel, selection, t],
  );
}

/**
 * Keeps `data-move-over` on a drop target while entries it can take are
 * dragged over it. @internal
 */
export function moveTargetHandlers({
  accepts,
  onMove,
}: {
  /** Whether the entries being dragged can go here. */
  accepts: () => boolean;
  onMove: () => void;
}): DropTargetProps {
  const allow = (event: DragEvent<HTMLElement>) => {
    if (!isMoveDrag(event) || !accepts()) return false;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    event.currentTarget.setAttribute("data-move-over", "");
    return true;
  };
  return {
    onDragEnter: allow,
    onDragOver: allow,
    onDragLeave: (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      event.currentTarget.removeAttribute("data-move-over");
    },
    onDrop: (event) => {
      if (!isMoveDrag(event)) return;
      event.currentTarget.removeAttribute("data-move-over");
      if (!accepts()) return;
      event.preventDefault();
      onMove();
    },
  };
}

/**
 * The Move dialog: browse to a folder, then move the entries there. It
 * opens in the open folder. The folders being moved cannot be opened or
 * chosen, so nothing moves into itself. @internal
 */
export function ObjectListMoveDialog<TItem>({
  request,
  onClose,
  moveRef,
}: {
  request: ObjectListMoveRequest<TItem> | null;
  onClose: () => void;
  /** Takes the move function, for moves that start without the dialog. */
  moveRef?: RefObject<ObjectListMoveFn<TItem> | null>;
}) {
  const t = useTranslations();
  const formatNumber = useFormatNumber();
  const { list } = useObjectListContext<TItem>();
  const move = useObjectListMove<TItem>();
  useLayoutEffect(() => {
    if (!moveRef) return;
    moveRef.current = move;
    return () => {
      moveRef.current = null;
    };
  }, [move, moveRef]);
  // Keep the copy while the dialog animates out.
  const [shown, setShown] = useState(request);
  if (request && request !== shown) setShown(request);
  const current = request ?? shown;
  const entries = current?.entries ?? [];
  const [single] = entries;
  const [moving, setMoving] = useState(false);
  const moveButtonRef = useRef<HTMLButtonElement>(null);
  // Where focus returns: the control that opened the dialog, else its list.
  const focusRef = useRef<{
    trigger: HTMLElement | null;
    root: HTMLElement | null;
  } | null>(null);

  // Opened again: start from the open folder.
  const [trail, setTrail] = useState<readonly ObjectListFolder[]>(list.trail);
  const [openedFor, setOpenedFor] = useState(request);
  if (request !== openedFor) {
    setOpenedFor(request);
    if (request) setTrail(list.trail);
  }

  useEffect(() => {
    if (request) {
      const { trigger } = request;
      focusRef.current = {
        trigger,
        root: trigger?.closest<HTMLElement>(FOCUS_ROOT) ?? null,
      };
      return;
    }
    const target = focusRef.current;
    focusRef.current = null;
    // The control that opened it, else the list once its row moved away.
    [target?.trigger, target?.root]
      .find((element) => element?.isConnected)
      ?.focus();
  }, [request]);

  const moved = new Set(
    entries.flatMap((entry) => (entry.kind === "folder" ? [entry.id] : [])),
  );
  const destination = trail.at(-1) ?? null;
  const destinationId = destination?.id ?? null;
  // Inside a folder that is moving: it cannot go into itself.
  const inside = trail.some((folder) => moved.has(folder.id));
  const alreadyThere =
    entries.length > 0 &&
    entries.every((entry) => entryHolder(entry, list) === destinationId);
  const canMove = !moving && !inside && !alreadyThere && entries.length > 0;

  async function onMove() {
    if (!canMove || !current) return;
    setMoving(true);
    try {
      await move(current.entries, destination);
    } finally {
      setMoving(false);
    }
    onClose();
  }

  return (
    <Dialog
      open={request != null}
      onOpenChange={(open) => {
        if (!open && !moving) onClose();
      }}
    >
      <DialogContent
        data-slot="object-list-move-dialog"
        showCloseButton={false}
        initialFocus={moveButtonRef}
        finalFocus={false}
        aria-busy={moving || undefined}
        className="flex max-h-[min(32rem,calc(100dvh-2rem))] flex-col gap-3 bg-dimah-s3-card text-dimah-s3-card-foreground ring-dimah-s3-foreground/10 sm:max-w-md"
      >
        <DialogHeader className="gap-1">
          <DialogTitle className="leading-snug [overflow-wrap:anywhere]">
            {entries.length === 1 && single
              ? t('Move "{name}"', {
                  note: "object list move",
                  variables: { name: isolateText(single.name) },
                })
              : t("Move {count} items", {
                  note: "object list move",
                  variables: { count: formatNumber(entries.length) },
                })}
          </DialogTitle>
          <DialogDescription className="text-dimah-s3-muted-foreground">
            {t("Open a folder, then move here.", {
              note: "object list move",
            })}
          </DialogDescription>
        </DialogHeader>
        <MovePath trail={trail} onNavigate={setTrail} />
        <MoveFolders
          parent={destinationId}
          blocked={moved}
          disabled={moving}
          onOpen={(folder) =>
            setTrail((path) => [...path, { id: folder.id, name: folder.name }])
          }
        />
        <DialogFooter className="border-dimah-s3-border bg-dimah-s3-muted/50 sm:items-center">
          {inside ? (
            <p className="text-xs text-dimah-s3-muted-foreground sm:me-auto">
              {t("A folder cannot move into itself.", {
                note: "object list move",
              })}
            </p>
          ) : null}
          <DialogClose
            disabled={moving}
            render={
              <Button variant="outline" className="pointer-coarse:h-10" />
            }
          >
            {t("Cancel", { note: "dialog button" })}
          </DialogClose>
          <Button
            ref={moveButtonRef}
            disabled={!canMove}
            focusableWhenDisabled
            // Focusable while disabled, so it dims by its data attribute.
            className="pointer-coarse:h-10 data-disabled:opacity-50"
            aria-busy={moving || undefined}
            onClick={() => void onMove()}
          >
            {moving ? (
              <Spinner
                data-icon="inline-start"
                aria-hidden
                aria-label={undefined}
                role={undefined}
              />
            ) : (
              <FolderInputIcon data-icon="inline-start" />
            )}
            {t("Move here", { note: "object list move" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The folder that holds `entry`: where a search result lives, else the
 * open folder. `undefined` for a search result that does not say. @internal
 */
export function entryHolder<TItem>(
  entry: ObjectListEntry<TItem>,
  list: { parent: string | null; isSearching: boolean },
): string | null | undefined {
  if (entry.location) return entry.location.at(-1)?.id ?? null;
  return list.isSearching ? undefined : list.parent;
}

/** The dialog's path: the root, then each folder down to the one open. */
function MovePath({
  trail,
  onNavigate,
}: {
  trail: readonly ObjectListFolder[];
  onNavigate: (trail: readonly ObjectListFolder[]) => void;
}) {
  const t = useTranslations();
  const { rootLabel } = useObjectListContext();
  const crumb =
    "flex min-w-0 max-w-40 items-center gap-1 rounded-sm px-1 outline-none hover:text-dimah-s3-foreground focus-visible:ring-2 focus-visible:ring-dimah-s3-ring/50 pointer-coarse:py-1.5";
  return (
    <nav aria-label={t("Folder path", { note: "object list" })}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-dimah-s3-muted-foreground">
        <li className="flex min-w-0 items-center">
          {trail.length === 0 ? (
            <span
              aria-current="page"
              className="flex min-w-0 items-center gap-1 px-1 font-medium text-dimah-s3-foreground"
            >
              <HomeIcon aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{rootLabel}</span>
            </span>
          ) : (
            <button
              type="button"
              className={crumb}
              onClick={() => onNavigate([])}
            >
              <HomeIcon aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{rootLabel}</span>
            </button>
          )}
        </li>
        {trail.map((folder, index) => {
          const last = index === trail.length - 1;
          return (
            <li key={folder.id} className="flex min-w-0 items-center gap-1">
              <ChevronRightIcon
                aria-hidden
                className="size-3.5 shrink-0 rtl:rotate-180"
              />
              {last ? (
                <span
                  aria-current="page"
                  className="truncate px-1 font-medium text-dimah-s3-foreground"
                >
                  <bdi>{folder.name}</bdi>
                </span>
              ) : (
                <button
                  type="button"
                  className={crumb}
                  onClick={() => onNavigate(trail.slice(0, index + 1))}
                >
                  <span className="truncate">
                    <bdi>{folder.name}</bdi>
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The folders inside `parent`, each a button that opens it. */
function MoveFolders({
  parent,
  blocked,
  disabled,
  onOpen,
}: {
  parent: string | null;
  /** Folders that are moving: shown, but they do not open. */
  blocked: ReadonlySet<string>;
  disabled: boolean;
  onOpen: (folder: ObjectListFolder) => void;
}) {
  const t = useTranslations();
  const formatError = useFormatError();
  const { list } = useObjectListContext();
  const { listFolders } = list;
  const labelId = useId();
  const [attempt, setAttempt] = useState(0);
  // What the last request for a folder and attempt returned.
  const [state, setState] = useState<{
    parent: string | null;
    attempt: number;
    folders: readonly ObjectListFolder[] | null;
    error: unknown;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const settle = (
      folders: readonly ObjectListFolder[] | null,
      error: unknown,
    ) => {
      if (controller.signal.aborted) return;
      setState({ parent, attempt, folders, error });
    };
    listFolders(parent, { signal: controller.signal }).then(
      (folders) => settle(folders, null),
      (error: unknown) => settle(null, error),
    );
    return () => controller.abort();
  }, [attempt, listFolders, parent]);

  const loaded =
    state?.parent === parent && state.attempt === attempt ? state : null;
  const frame =
    "flex min-h-40 flex-1 flex-col overflow-y-auto rounded-lg border border-dimah-s3-border";

  if (loaded?.error != null) {
    return (
      <div
        role="alert"
        className={cn(
          frame,
          "items-center justify-center gap-2 p-4 text-center",
        )}
      >
        <p className="text-sm [overflow-wrap:anywhere] text-dimah-s3-destructive">
          {formatError(loaded.error)}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAttempt((count) => count + 1)}
        >
          {t("Try again", { note: "object list move" })}
        </Button>
      </div>
    );
  }
  if (!loaded?.folders) {
    return (
      <div className={cn(frame, "items-center justify-center")}>
        <Spinner
          className="text-dimah-s3-muted-foreground"
          aria-label={t("Loading folders", { note: "object list move" })}
        />
      </div>
    );
  }
  if (loaded.folders.length === 0) {
    return (
      <div className={cn(frame, "items-center justify-center p-4")}>
        <p className="text-sm text-dimah-s3-muted-foreground">
          {t("No folders here", { note: "object list move" })}
        </p>
      </div>
    );
  }
  return (
    <div className={frame}>
      <span id={labelId} className="sr-only">
        {t("Folders", { note: "object list move" })}
      </span>
      <ul aria-labelledby={labelId} className="flex flex-col p-1">
        {loaded.folders.map((folder) => {
          const moving = blocked.has(folder.id);
          return (
            <li key={folder.id}>
              <button
                type="button"
                disabled={disabled || moving}
                className="flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-start text-sm text-dimah-s3-foreground outline-none hover:bg-dimah-s3-muted focus-visible:ring-3 focus-visible:ring-dimah-s3-ring/50 disabled:pointer-events-none disabled:opacity-50 pointer-coarse:min-h-11"
                onClick={() => onOpen(folder)}
              >
                <FolderGlyph className="size-5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  <bdi>{folder.name}</bdi>
                </span>
                {moving ? (
                  <span className="shrink-0 text-xs text-dimah-s3-muted-foreground">
                    {t("Moving", { note: "object list move" })}
                  </span>
                ) : (
                  <ChevronRightIcon
                    aria-hidden
                    className="size-4 shrink-0 text-dimah-s3-muted-foreground rtl:rotate-180"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
