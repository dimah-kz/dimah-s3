"use client";

import { memo, useEffect, useState, type ReactNode } from "react";
import { useFormatError, type ObjectListEntry } from "@dimah-s3/react";
import { cn } from "cn";
import {
  ObjectListEntryProvider,
  useObjectListContext,
  type ObjectListView,
} from "@/components/dimah-s3/list/object-list-context";
import {
  ObjectListRow,
  ObjectListTile,
} from "@/components/dimah-s3/list/object-list-entry";
import {
  ObjectListEmpty,
  ObjectListError,
  ObjectListErrorBanner,
  ObjectListPagination,
  ObjectListSkeleton,
} from "@/components/dimah-s3/list/object-list-states";

/**
 * The rows, or the loading, error, and empty states, and the next page.
 * With `height` or `maxHeight` on the list, this is the part that scrolls.
 */
export function ObjectListContent({ className }: { className?: string }) {
  const context = useObjectListContext();
  const { list, view, sizing } = context;
  const formatError = useFormatError();
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const hasRows = list.entries.length > 0;
  const errorMessage = list.error ? formatError(list.error) : null;
  const showEmpty = !list.isLoading && !list.error && !hasRows;

  // A new folder starts at the top.
  useEffect(() => {
    scroller?.scrollTo({ top: 0 });
  }, [list.parent, scroller]);

  return (
    <div
      ref={setScroller}
      data-slot="object-list-content"
      className={cn(
        "flex min-w-0 flex-col",
        sizing &&
          cn(
            "min-h-0 overflow-y-auto overscroll-y-contain",
            sizing === "fixed" ? "flex-1" : "flex-auto",
          ),
        className,
      )}
    >
      {list.isLoading ? <ObjectListSkeleton view={view} /> : null}

      {list.error && !hasRows && !list.isLoading ? (
        <ObjectListError message={errorMessage} onRetry={list.retry} />
      ) : null}

      {showEmpty ? (context.empty ?? <ObjectListEmpty />) : null}

      {hasRows ? (
        <ObjectListEntries
          entries={list.entries}
          view={view}
          renderEntry={context.renderEntry}
        />
      ) : null}

      {hasRows && errorMessage ? (
        <ObjectListErrorBanner message={errorMessage} onRetry={list.retry} />
      ) : null}

      <ObjectListPagination
        mode={context.pagination}
        root={sizing ? scroller : null}
        ready={!sizing || scroller != null}
      />
    </div>
  );
}

/**
 * Entries off screen skip layout and paint. Each keeps a placeholder block
 * size until it is first drawn, then its last drawn size.
 */
const ENTRY_VISIBILITY = {
  list: "[contain-intrinsic-block-size:auto_2.75rem] [content-visibility:auto]",
  grid: "[contain-intrinsic-block-size:auto_9.5rem] [content-visibility:auto]",
} as const;

/**
 * The entries. Memoized, so it draws again only when the entries, the view,
 * or `renderEntry` change, and not on every upload tick.
 *
 * The edges around them take focus for a moment when Tab leaves the
 * entries, so the browser moves on from outside them: the entries are one
 * tab stop.
 */
const ObjectListEntries = memo(function ObjectListEntries({
  entries,
  view,
  renderEntry,
}: {
  entries: readonly ObjectListEntry<unknown>[];
  view: ObjectListView;
  renderEntry: ((entry: ObjectListEntry<unknown>) => ReactNode) | undefined;
}) {
  return (
    <>
      <span data-slot="object-list-entries-start" tabIndex={-1} />
      <div
        role="list"
        data-slot="object-list-entries"
        data-view={view}
        className={
          view === "grid"
            ? "grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2 p-2"
            : "flex min-w-0 flex-col"
        }
      >
        {entries.map((entry) => (
          <div
            key={entry.key}
            role="listitem"
            className={cn("min-w-0", ENTRY_VISIBILITY[view])}
          >
            <ObjectListEntryProvider entry={entry}>
              {renderEntry ? (
                renderEntry(entry)
              ) : view === "grid" ? (
                <ObjectListTile entry={entry} />
              ) : (
                <ObjectListRow entry={entry} />
              )}
            </ObjectListEntryProvider>
          </div>
        ))}
      </div>
      <span data-slot="object-list-entries-end" tabIndex={-1} />
    </>
  );
});
