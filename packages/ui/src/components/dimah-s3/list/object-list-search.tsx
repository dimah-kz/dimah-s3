"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  useFormatNumber,
  type ObjectListFolder,
  type ObjectListSearchScope,
  type UseObjectListReturn,
} from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import {
  ChevronRightIcon,
  FolderIcon,
  HomeIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useObjectListContext,
  useOptionalObjectListHeader,
} from "@/components/dimah-s3/list/object-list-context";

const ENTRY_TRIGGER = "[data-slot=object-list-entry-trigger]";

/**
 * True when the list can search the open folder or everywhere: the source
 * has both scopes and a folder is open. @internal
 */
export function canChooseSearchScope<TItem>(
  list: UseObjectListReturn<TItem>,
): boolean {
  return (
    list.parent != null &&
    list.searchScopes.includes("folder") &&
    list.searchScopes.includes("all")
  );
}

/** Props for {@link ObjectListSearch}. */
export type ObjectListSearchProps = {
  /**
   * Placeholder and accessible name. Defaults to where the search looks:
   * "Search files", `Search in “Docs”`, or "Search all files".
   */
  placeholder?: string;
  /** Milliseconds to wait after typing before the list reloads. @default 250 */
  delay?: number;
  /**
   * Inside `ObjectListHeader`, start as a search button that opens into a
   * field across the whole bar. `false` keeps the field in the bar. Outside
   * a header the field always shows. @default true
   */
  collapsible?: boolean;
  className?: string;
};

/**
 * Search for `list.search`. The query receives the text and
 * `list.searchScope`; the source decides what matches (`memoryObjectSource`
 * and `dbObjectSource` match names in every folder below the open one).
 *
 * Inside `ObjectListHeader` it is a search button. A click, or `/` from
 * the list, opens a field across the whole bar and focuses it; the field
 * stays open while it has text. A spinner shows while results load.
 * ArrowDown moves to the first result once they have loaded. Escape clears
 * the text, then closes the field. Close search clears and closes it, and
 * focus returns to the button. An empty field also closes when focus
 * leaves it, or when the search is cleared from elsewhere, such as by Show
 * in folder. Render it as a direct child of the header; the header shows
 * `ObjectListSearchBar` under it while a search is on.
 */
export function ObjectListSearch({
  placeholder,
  delay = 250,
  collapsible = true,
  className,
}: ObjectListSearchProps) {
  const t = useTranslations();
  const { list } = useObjectListContext();
  const header = useOptionalObjectListHeader();
  const { setSearch } = list;
  // Typed text that has not reached the list yet.
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? list.search;
  const defaultLabel = useSearchPlaceholder(list);
  const label = placeholder ?? defaultLabel;
  const collapses = collapsible && header != null;
  const [open, setOpen] = useState(false);
  const expanded = !collapses || open || value !== "";
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /** Where focus goes once the field has opened or closed. */
  const focusRef = useRef<"input" | "button" | null>(null);
  // Typing ahead of the list, or the results of the text it has.
  const loading =
    (draft != null && draft.trim() !== list.search.trim()) ||
    (list.isSearching && (list.isLoading || list.isRefreshing));

  useEffect(() => {
    if (draft == null) return;
    const timer = window.setTimeout(() => {
      setSearch(draft);
      setDraft(null);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [delay, draft, setSearch]);

  // The header gives an open field the whole bar.
  const setSearchExpanded = header?.setSearchExpanded;
  useLayoutEffect(() => {
    if (!collapses || !setSearchExpanded) return;
    setSearchExpanded(expanded);
    return () => setSearchExpanded(false);
  }, [collapses, expanded, setSearchExpanded]);

  useEffect(() => {
    const target = focusRef.current;
    if (!target) return;
    focusRef.current = null;
    (target === "input" ? inputRef : buttonRef).current?.focus();
  });

  // A search cleared from elsewhere, such as by opening a result's folder,
  // gives the bar back to the path, unless the field has focus. After the
  // focus effect, so a field that is opening has its focus already.
  useEffect(() => {
    if (!collapses || !open || value !== "") return;
    if (rootRef.current?.contains(document.activeElement)) return;
    setOpen(false);
  }, [collapses, open, value]);

  function commit(next: string) {
    setDraft(null);
    setSearch(next);
  }

  function close() {
    commit("");
    setOpen(false);
    focusRef.current = "button";
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") commit(value);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      // The rows on screen are about to go: send the text and stay here.
      if (loading) {
        if (draft != null) commit(draft);
        return;
      }
      // Into the results: the entry that keeps the list's tab stop.
      const frame = event.currentTarget.closest("[data-slot=object-list]");
      const entry =
        frame?.querySelector<HTMLElement>(`${ENTRY_TRIGGER}[tabindex="0"]`) ??
        frame?.querySelector<HTMLElement>(ENTRY_TRIGGER);
      entry?.focus();
      return;
    }
    if (event.key !== "Escape") return;
    if (value) {
      event.preventDefault();
      commit("");
    } else if (collapses) {
      event.preventDefault();
      close();
    }
  }

  if (!expanded) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              ref={buttonRef}
              type="button"
              variant="ghost"
              size="icon-sm"
              data-slot="object-list-search"
              aria-label={label}
              aria-keyshortcuts="/"
              className={className}
              onClick={() => {
                focusRef.current = "input";
                setOpen(true);
              }}
            />
          }
        >
          <SearchIcon />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  }

  const spinner = loading ? (
    <Spinner
      className="size-3.5 text-dimah-s3-muted-foreground"
      aria-label={t("Searching", { note: "object list search" })}
    />
  ) : null;

  return (
    <div
      ref={rootRef}
      data-slot="object-list-search"
      data-expanded=""
      data-loading={loading ? "" : undefined}
      className={cn(
        "relative flex min-w-0 items-center",
        collapses ? "w-full flex-1" : "w-40 sm:w-52",
        className,
      )}
      onBlur={(event) => {
        if (!collapses || value !== "") return;
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setOpen(false);
      }}
    >
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute start-2.5 size-3.5 text-dimah-s3-muted-foreground"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        placeholder={label}
        aria-label={label}
        aria-keyshortcuts="/"
        aria-busy={loading || undefined}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        className={cn(
          "w-full min-w-0 rounded-md border border-dimah-s3-border bg-transparent ps-8 text-sm text-dimah-s3-foreground outline-none placeholder:text-dimah-s3-muted-foreground focus-visible:border-dimah-s3-ring focus-visible:ring-3 focus-visible:ring-dimah-s3-ring/50 [&::-webkit-search-cancel-button]:appearance-none",
          collapses ? "h-8 pe-14" : "h-7 pe-12",
        )}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {collapses ? (
        <div className="absolute end-1.5 flex items-center gap-1">
          {spinner}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("Close search", { note: "object list" })}
            onClick={close}
          >
            <XIcon />
          </Button>
        </div>
      ) : (
        <div className="absolute end-1 flex items-center gap-1">
          {spinner}
          {value ? (
            <button
              type="button"
              aria-label={t("Clear search", { note: "object list" })}
              className="flex size-5 items-center justify-center rounded-sm text-dimah-s3-muted-foreground outline-none hover:text-dimah-s3-foreground focus-visible:ring-2 focus-visible:ring-dimah-s3-ring/50"
              onClick={() => commit("")}
            >
              <XIcon className="size-3.5" />
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** "Search files", `Search in “Docs”`, or "Search all files". */
function useSearchPlaceholder<TItem>(list: UseObjectListReturn<TItem>) {
  const t = useTranslations();
  const folder = list.trail.at(-1);
  if (!folder || list.searchScopes.length === 0) {
    return t("Search files", { note: "object list" });
  }
  if (list.searchScope === "all" && canChooseSearchScope(list)) {
    return t("Search all files", { note: "object list search" });
  }
  return t("Search in “{folder}”", {
    note: "object list search",
    variables: { folder: folder.name },
  });
}

/**
 * How many results the search found, for the search bar and the list's
 * live region: "12 results", "50+ results" while more pages are left and
 * the source sent no `total`, "No results", or "Searching…". `null` while
 * nothing is searched. @internal
 */
export function useObjectListSearchStatus<TItem>(
  list: UseObjectListReturn<TItem>,
): { label: string; settled: boolean } | null {
  const t = useTranslations();
  const formatNumber = useFormatNumber();
  if (!list.isSearching) return null;
  if (list.isLoading || list.isRefreshing) {
    return {
      label: t("Searching…", { note: "object list search" }),
      settled: false,
    };
  }
  if (list.error) return null;
  const files = list.total ?? list.items.length;
  const count = list.folders.length + files;
  const more = list.total == null && list.hasMore;
  if (count === 0) {
    return { label: t("No results", { note: "object list" }), settled: true };
  }
  if (more) {
    return {
      label: t("{count}+ results", {
        note: "object list search",
        variables: { count: formatNumber(count) },
      }),
      settled: true,
    };
  }
  return {
    label:
      count === 1
        ? t("1 result", { note: "object list search" })
        : t("{count} results", {
            note: "object list search",
            variables: { count: formatNumber(count) },
          }),
    settled: true,
  };
}

/** Props for {@link ObjectListSearchBar}. */
export type ObjectListSearchBarProps = {
  className?: string;
};

/**
 * Where the search looks and what it found, under the header while a
 * search is on. With a source that can search the open folder or
 * everywhere (`searchScopes`), "Search in" picks between the open folder
 * (and the folders in it) and the root. The result count is read out by
 * the list's live region. Renders nothing while nothing is searched.
 * `ObjectListHeader` already shows one.
 */
export function ObjectListSearchBar({ className }: ObjectListSearchBarProps) {
  const t = useTranslations();
  const { list, label: rootLabel } = useObjectListContext();
  const status = useObjectListSearchStatus(list);
  if (!status) return null;
  const folder = list.trail.at(-1);
  const choose = canChooseSearchScope(list);
  const inLabel = t("Search in", { note: "object list search" });

  return (
    <div
      data-slot="object-list-search-bar"
      className={cn(
        "flex min-h-9 min-w-0 items-center gap-2 px-2 py-1 text-xs text-dimah-s3-muted-foreground",
        className,
      )}
    >
      <span className="shrink-0">{inLabel}</span>
      {choose && folder ? (
        <div
          role="radiogroup"
          aria-label={inLabel}
          className="flex min-w-0 items-center gap-0.5 rounded-lg border border-dimah-s3-border p-0.5"
        >
          <ScopeChoice
            scope="folder"
            current={list.searchScope}
            onSelect={list.setSearchScope}
            icon={<FolderIcon aria-hidden />}
            label={folder.name}
          />
          <ScopeChoice
            scope="all"
            current={list.searchScope}
            onSelect={list.setSearchScope}
            icon={<HomeIcon aria-hidden />}
            label={rootLabel}
          />
        </div>
      ) : (
        <span className="flex min-w-0 items-center gap-1 font-medium text-dimah-s3-foreground">
          {folder ? (
            <FolderIcon aria-hidden className="size-3.5 shrink-0" />
          ) : (
            <HomeIcon aria-hidden className="size-3.5 shrink-0" />
          )}
          <span className="truncate">
            <bdi>{folder?.name ?? rootLabel}</bdi>
          </span>
        </span>
      )}
      {/* The list's live region reads the count out. */}
      <span
        data-slot="object-list-search-status"
        className="ms-auto shrink-0 tabular-nums"
      >
        {status.label}
      </span>
    </div>
  );
}

/** One button of the "Search in" choice. */
function ScopeChoice({
  scope,
  current,
  onSelect,
  icon,
  label,
}: {
  scope: ObjectListSearchScope;
  current: ObjectListSearchScope;
  onSelect: (scope: ObjectListSearchScope) => void;
  icon: ReactNode;
  label: string;
}) {
  const checked = scope === current;
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      role="radio"
      aria-checked={checked}
      // One tab stop for the group; arrow keys switch.
      tabIndex={checked ? 0 : -1}
      className="min-w-0 aria-checked:bg-dimah-s3-muted aria-checked:text-dimah-s3-foreground"
      onClick={() => onSelect(scope)}
      onKeyDown={(event) => {
        if (
          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        ) {
          return;
        }
        event.preventDefault();
        const next = scope === "folder" ? "all" : "folder";
        onSelect(next);
        const group = event.currentTarget.parentElement;
        // Focus follows the choice once it has drawn.
        requestAnimationFrame(() =>
          group
            ?.querySelector<HTMLElement>("[role=radio][aria-checked=true]")
            ?.focus(),
        );
      }}
    >
      {icon}
      <span className="max-w-32 truncate">
        <bdi>{label}</bdi>
      </span>
    </Button>
  );
}

/** Props for {@link ObjectListLocation}. */
export type ObjectListLocationProps = {
  /** Folders from the root down to the one that holds the entry. */
  location: readonly ObjectListFolder[];
  className?: string;
};

/**
 * Where a search result lives: `Docs › 2024`, the root label at the root,
 * and `… › Parent › Folder` when it is deeper. Text only, so it fits an
 * entry's description; `title` holds the whole path.
 */
export function ObjectListLocation({
  location,
  className,
}: ObjectListLocationProps) {
  const { label: rootLabel } = useObjectListContext();
  const names =
    location.length === 0 ? [rootLabel] : location.map((folder) => folder.name);
  const shown = names.length > 2 ? ["…", ...names.slice(-2)] : names;
  return (
    <span
      data-slot="object-list-location"
      title={[rootLabel, ...location.map((folder) => folder.name)].join(" / ")}
      className={cn("min-w-0", className)}
    >
      <FolderIcon
        aria-hidden
        className="me-1 inline-block size-3 shrink-0 align-[-0.125rem]"
      />
      {shown.map((name, index) => (
        <span key={index}>
          {index > 0 ? (
            <>
              <ChevronRightIcon
                aria-hidden
                className="mx-0.5 inline-block size-3 align-[-0.125rem] rtl:rotate-180"
              />
              <span className="sr-only"> / </span>
            </>
          ) : null}
          <bdi>{name}</bdi>
        </span>
      ))}
    </span>
  );
}
