"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AlertCircleIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { ObjectListView } from "@/components/dimah-s3/list/object-list-context";
import { useObjectListContext } from "@/components/dimah-s3/list/object-list-context";
import { FolderGlyph } from "@/components/dimah-s3/attachment/folder-glyph";

/** Props for {@link ObjectListEmpty}. */
export type ObjectListEmptyProps = {
  /** Defaults to "This folder is empty", or "No results" while searching. */
  title?: ReactNode;
  description?: ReactNode;
  /** Below the text, such as an upload button. */
  children?: ReactNode;
  className?: string;
};

/**
 * Empty state for the open folder. Pass it as `empty` with your own text
 * or a call to action. It reads the search text from the list.
 */
export function ObjectListEmpty({
  title,
  description,
  children,
  className,
}: ObjectListEmptyProps) {
  const t = useTranslations();
  const { list, upload } = useObjectListContext();
  const search = list.search.trim();

  const defaultTitle = search
    ? t("No results", { note: "object list" })
    : t("This folder is empty", { note: "object list" });
  const defaultDescription = search
    ? t("Nothing in this folder matches “{search}”.", {
        note: "object list",
        variables: { search },
      })
    : upload
      ? t("Drop files here to add them to this folder.", {
          note: "object list",
        })
      : t("Files and folders you add here will show up in this list.", {
          note: "object list",
        });

  return (
    <Empty data-slot="object-list-empty" className={cn("border-0", className)}>
      <EmptyHeader>
        {search ? (
          <EmptyMedia variant="icon">
            <SearchIcon />
          </EmptyMedia>
        ) : (
          <FolderGlyph className="mb-1 size-12" />
        )}
        <EmptyTitle>{title ?? defaultTitle}</EmptyTitle>
        <EmptyDescription className="[overflow-wrap:anywhere]">
          {description ?? defaultDescription}
        </EmptyDescription>
      </EmptyHeader>
      {children ? <EmptyContent>{children}</EmptyContent> : null}
    </Empty>
  );
}

export function ObjectListError({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry?: () => void | Promise<void>;
}) {
  const t = useTranslations();

  return (
    <Empty className="border-0" role="alert">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertCircleIcon />
        </EmptyMedia>
        <EmptyTitle>
          {t("Could not load files", { note: "object list" })}
        </EmptyTitle>
        {message ? (
          <EmptyDescription className="[overflow-wrap:anywhere]">
            {message}
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
      {onRetry ? (
        <EmptyContent>
          <RetryButton onRetry={onRetry} />
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

export function ObjectListErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void | Promise<void>;
}) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 border-t border-dimah-s3-border px-3 py-2"
    >
      <p className="min-w-0 text-sm [overflow-wrap:anywhere] text-dimah-s3-destructive">
        {message}
      </p>
      <RetryButton onRetry={onRetry} />
    </div>
  );
}

function RetryButton({ onRetry }: { onRetry?: () => void | Promise<void> }) {
  const t = useTranslations();
  if (!onRetry) return null;
  return (
    <Button variant="outline" size="sm" onClick={() => void onRetry()}>
      {t("Retry", { note: "object list" })}
    </Button>
  );
}

const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f"];

export function ObjectListSkeleton({ view }: { view: ObjectListView }) {
  if (view === "grid") {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2 p-2">
        {SKELETON_KEYS.map((key) => (
          <div
            key={key}
            className="flex flex-col overflow-hidden rounded-lg border border-dimah-s3-border"
          >
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
            <div className="flex flex-col gap-1 px-2 py-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {SKELETON_KEYS.slice(0, 4).map((key) => (
        <div
          key={key}
          className="flex min-h-11 items-center gap-2 py-1 ps-1.5 pe-1"
        >
          <Skeleton className="size-8 rounded-sm" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className="h-3.5 w-40 max-w-full" />
            <Skeleton className="h-3 w-16 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The next page. `auto` loads it when the end of the rows is on screen;
 * `button` waits for Load more.
 */
export function ObjectListPagination({
  mode,
  root,
  ready,
}: {
  mode: "auto" | "button";
  /** Scroll parent. `null` uses the viewport. */
  root: HTMLElement | null;
  ready: boolean;
}) {
  const t = useTranslations();
  const { list } = useObjectListContext();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(list.loadMore);
  const active = list.hasMore;
  const pending = list.isLoadingMore;
  const blocked = list.error != null;

  useEffect(() => {
    loadMoreRef.current = list.loadMore;
  }, [list.loadMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (mode !== "auto" || !node || !ready || !active || pending || blocked) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        void loadMoreRef.current();
      },
      { root, rootMargin: "48px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [active, blocked, mode, pending, ready, root]);

  if (!active && !pending) return null;

  if (mode === "button") {
    if (blocked) return null;
    return (
      <div className="flex shrink-0 justify-center p-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => void list.loadMore()}
        >
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {t("Load more", { note: "object list" })}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col">
      {pending ? (
        <div className="flex justify-center py-2">
          <Spinner aria-label={t("Loading files", { note: "object list" })} />
        </div>
      ) : null}
      {active ? (
        <div ref={sentinelRef} aria-hidden className="h-px w-full shrink-0" />
      ) : null}
    </div>
  );
}
