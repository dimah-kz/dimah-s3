"use client";

import { useEffect, useRef } from "react";
import { AlertCircleIcon } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
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
import { FolderGlyph } from "@/lib/file-type-icon";

export function ObjectListEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <FolderGlyph className="mb-1 size-12" />
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
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
    <Empty className="border-0">
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
          <ObjectListRetry onRetry={onRetry} />
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
      <ObjectListRetry onRetry={onRetry} />
    </div>
  );
}

function ObjectListRetry({
  onRetry,
}: {
  onRetry?: () => void | Promise<void>;
}) {
  const t = useTranslations();
  if (!onRetry) return null;
  return (
    <Button variant="outline" size="sm" onClick={() => void onRetry()}>
      {t("Retry", { note: "object list" })}
    </Button>
  );
}

export function ObjectListSkeleton() {
  return (
    <div className="flex flex-col">
      {["a", "b", "c", "d"].map((key) => (
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

/** Loads the next page when the end of the rows is on screen. */
export function ObjectListContinue({
  active,
  pending,
  blocked,
  loadMore,
  root,
  ready,
}: {
  active: boolean;
  pending: boolean;
  blocked: boolean;
  loadMore?: () => void | Promise<void>;
  /** Scroll parent. `null` uses the viewport. */
  root: HTMLElement | null;
  ready: boolean;
}) {
  const t = useTranslations();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMore);

  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !ready || !active || pending || blocked) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        void loadMoreRef.current?.();
      },
      { root, rootMargin: "48px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [active, blocked, pending, ready, root]);

  if (!active && !pending) return null;

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
