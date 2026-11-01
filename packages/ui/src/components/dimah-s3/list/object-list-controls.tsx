"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ObjectListSortDirection } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import {
  ArrowDownUpIcon,
  LayoutGridIcon,
  ListIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useObjectListContext } from "@/components/dimah-s3/list/object-list-context";
import {
  OBJECT_LIST_HEADER_COMPACT_BUTTON,
  OBJECT_LIST_HEADER_COMPACT_LABEL,
  useOptionalObjectListHeader,
} from "@/components/dimah-s3/list/object-list-header";

/** Props for {@link ObjectListSearch}. */
export type ObjectListSearchProps = {
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
 * Search for `list.search`. The query receives the text; the source
 * decides what matches (`memoryObjectSource` matches names).
 *
 * Inside `ObjectListHeader` it is a search button. A click opens a field
 * across the whole bar and focuses it; the field stays open while it has
 * text. Escape clears the text, then closes the field. Close search clears
 * and closes it, and focus returns to the button. An empty field also
 * closes when focus leaves it. Render it as a direct child of the header.
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
  const label = placeholder ?? t("Search files", { note: "object list" });
  const collapses = collapsible && header != null;
  const [open, setOpen] = useState(false);
  const expanded = !collapses || open || value !== "";
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  /** Where focus goes once the field has opened or closed. */
  const focusRef = useRef<"input" | "button" | null>(null);

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

  function commit(next: string) {
    setDraft(null);
    setSearch(next);
  }

  function close() {
    commit("");
    setOpen(false);
    focusRef.current = "button";
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

  return (
    <div
      data-slot="object-list-search"
      data-expanded=""
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
        autoComplete="off"
        className={cn(
          "w-full min-w-0 rounded-md border border-dimah-s3-border bg-transparent ps-8 text-sm text-dimah-s3-foreground outline-none placeholder:text-dimah-s3-muted-foreground focus-visible:border-dimah-s3-ring focus-visible:ring-3 focus-visible:ring-dimah-s3-ring/50 [&::-webkit-search-cancel-button]:appearance-none",
          collapses ? "h-8 pe-9" : "h-7 pe-7",
        )}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(value);
          if (event.key !== "Escape") return;
          if (value) {
            event.preventDefault();
            commit("");
          } else if (collapses) {
            event.preventDefault();
            close();
          }
        }}
      />
      {collapses ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t("Close search", { note: "object list" })}
          className="absolute end-1.5"
          onClick={close}
        >
          <XIcon />
        </Button>
      ) : value ? (
        <button
          type="button"
          aria-label={t("Clear search", { note: "object list" })}
          className="absolute end-1 flex size-5 items-center justify-center rounded-sm text-dimah-s3-muted-foreground outline-none hover:text-dimah-s3-foreground focus-visible:ring-2 focus-visible:ring-dimah-s3-ring/50"
          onClick={() => commit("")}
        >
          <XIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** One choice in {@link ObjectListSortMenu}. */
export type ObjectListSortOption = {
  /** Sent to the query as `sort.field`. */
  field: string;
  label: string;
  /** Direction when this field is first picked. @default "asc" */
  direction?: ObjectListSortDirection;
};

/**
 * Sort picker for `list.sort`. The query receives the order; the source
 * applies it. Defaults to name, size, and date.
 */
export function ObjectListSortMenu({
  options,
  className,
}: {
  options?: readonly ObjectListSortOption[];
  className?: string;
}) {
  const t = useTranslations();
  const { list } = useObjectListContext();
  const choices = options ?? [
    { field: "name", label: t("Name", { note: "object list sort" }) },
    {
      field: "size",
      label: t("Size", { note: "object list sort" }),
      direction: "desc" as const,
    },
    {
      field: "updatedAt",
      label: t("Modified", { note: "object list sort" }),
      direction: "desc" as const,
    },
  ];
  const current = choices.find((choice) => choice.field === list.sort?.field);
  const sortLabel = t("Sort", { note: "object list sort" });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            data-slot="object-list-sort"
            className={cn(OBJECT_LIST_HEADER_COMPACT_BUTTON, className)}
          />
        }
      >
        <ArrowDownUpIcon data-icon="inline-start" />
        <span className={OBJECT_LIST_HEADER_COMPACT_LABEL}>
          {current?.label ?? sortLabel}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{sortLabel}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={list.sort?.field ?? ""}
            onValueChange={(field: string) => {
              const choice = choices.find((item) => item.field === field);
              if (!choice) return;
              list.setSort({
                field,
                direction:
                  list.sort?.field === field
                    ? list.sort.direction
                    : (choice.direction ?? "asc"),
              });
            }}
          >
            {choices.map((choice) => (
              <DropdownMenuRadioItem key={choice.field} value={choice.field}>
                {choice.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuRadioGroup
            value={list.sort?.direction ?? ""}
            onValueChange={(direction: ObjectListSortDirection) => {
              if (list.sort) list.setSort({ ...list.sort, direction });
            }}
          >
            <DropdownMenuRadioItem value="asc" disabled={!list.sort}>
              {t("Ascending", { note: "object list sort" })}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="desc" disabled={!list.sort}>
              {t("Descending", { note: "object list sort" })}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** List and grid buttons for the list's `view`. */
export function ObjectListViewToggle({ className }: { className?: string }) {
  const t = useTranslations();
  const { view, setView } = useObjectListContext();
  const options = [
    {
      value: "list",
      label: t("List view", { note: "object list" }),
      Icon: ListIcon,
    },
    {
      value: "grid",
      label: t("Grid view", { note: "object list" }),
      Icon: LayoutGridIcon,
    },
  ] as const;

  return (
    <div
      role="group"
      aria-label={t("View", { note: "object list" })}
      data-slot="object-list-view-toggle"
      className={cn(
        "flex items-center gap-0.5 rounded-lg border border-dimah-s3-border p-0.5",
        className,
      )}
    >
      {options.map(({ value, label, Icon }) => (
        <Button
          key={value}
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          aria-pressed={view === value}
          className="aria-pressed:bg-dimah-s3-muted aria-pressed:text-dimah-s3-foreground"
          onClick={() => setView(value)}
        >
          <Icon />
        </Button>
      ))}
    </div>
  );
}
