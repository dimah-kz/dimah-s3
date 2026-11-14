"use client";

import type { ObjectListSortDirection } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { ArrowDownUpIcon, LayoutGridIcon, ListIcon } from "lucide-react";
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
import {
  OBJECT_LIST_HEADER_COMPACT_BUTTON,
  OBJECT_LIST_HEADER_COMPACT_LABEL,
} from "@/components/dimah-s3/list/object-list-header";

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
