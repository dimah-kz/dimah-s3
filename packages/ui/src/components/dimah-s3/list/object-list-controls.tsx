"use client";

import { useEffect, useState } from "react";
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

/** Props for {@link ObjectListSearch}. */
export type ObjectListSearchProps = {
  placeholder?: string;
  /** Milliseconds to wait after typing before the list reloads. @default 250 */
  delay?: number;
  className?: string;
};

/**
 * Search box for `list.search`. The query receives the text; the source
 * decides what matches (`memoryObjectSource` matches names).
 */
export function ObjectListSearch({
  placeholder,
  delay = 250,
  className,
}: ObjectListSearchProps) {
  const t = useTranslations();
  const { list } = useObjectListContext();
  const { setSearch } = list;
  // Typed text that has not reached the list yet.
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? list.search;
  const label = placeholder ?? t("Search files", { note: "object list" });

  useEffect(() => {
    if (draft == null) return;
    const timer = window.setTimeout(() => {
      setSearch(draft);
      setDraft(null);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [delay, draft, setSearch]);

  function commit(next: string) {
    setDraft(null);
    setSearch(next);
  }

  return (
    <div
      data-slot="object-list-search"
      className={cn(
        "relative flex w-40 min-w-0 items-center sm:w-52",
        className,
      )}
    >
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute start-2 size-3.5 text-dimah-s3-muted-foreground"
      />
      <input
        type="search"
        value={value}
        placeholder={label}
        aria-label={label}
        className="h-7 w-full min-w-0 rounded-md border border-dimah-s3-border bg-transparent ps-7 pe-7 text-sm text-dimah-s3-foreground outline-none placeholder:text-dimah-s3-muted-foreground focus-visible:border-dimah-s3-ring focus-visible:ring-3 focus-visible:ring-dimah-s3-ring/50 [&::-webkit-search-cancel-button]:appearance-none"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(value);
          if (event.key === "Escape" && value) {
            event.preventDefault();
            commit("");
          }
        }}
      />
      {value ? (
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
            className={className}
          />
        }
      >
        <ArrowDownUpIcon data-icon="inline-start" />
        <span className="max-sm:sr-only">{current?.label ?? sortLabel}</span>
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
