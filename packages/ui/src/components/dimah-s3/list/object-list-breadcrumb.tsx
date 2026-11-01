"use client";

import type { ObjectListFolder } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { FolderIcon, HomeIcon } from "lucide-react";
import { cn } from "cn";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useObjectListContext } from "@/components/dimah-s3/list/object-list-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/*
 * The path shortens with its own width (a container query), not the
 * window's, so it fits a narrow sidebar as well as a phone:
 *
 *   wide    Files › … › Parent › Current
 *   medium  Files › … › Current
 *   narrow  … › Current
 *
 * The open folder always shows, and the … menu lists every folder above
 * it, so any of them is one click away.
 */
const HIDE_ROOT = "@max-[13rem]/object-list-breadcrumb:hidden";
const HIDE_PARENT = "@max-[22rem]/object-list-breadcrumb:hidden";

const CRUMB =
  "block max-w-32 truncate rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-dimah-s3-ring/50";

/** Classes that show the … menu while some folder above the open one is hidden. */
function menuVisibility(depth: number) {
  if (depth > 2) return "flex";
  if (depth === 2) return "hidden @max-[22rem]/object-list-breadcrumb:flex";
  return "hidden @max-[13rem]/object-list-breadcrumb:flex";
}

/**
 * Path from the root to the open folder. It shortens to fit its width,
 * down to the open folder alone, and a menu lists the folders above it.
 */
export function ObjectListBreadcrumb({ className }: { className?: string }) {
  const { list, label: rootLabel } = useObjectListContext();
  const { trail, navigate } = list;
  const t = useTranslations();
  const depth = trail.length;
  const current = trail.at(-1);
  const parent = depth >= 2 ? trail[depth - 2] : undefined;

  return (
    <Breadcrumb
      data-slot="object-list-breadcrumb"
      className={cn(
        "@container/object-list-breadcrumb min-w-0 flex-1",
        className,
      )}
    >
      <BreadcrumbList className="min-w-0 flex-nowrap gap-1 text-sm">
        <BreadcrumbItem
          className={cn("min-w-0", current ? HIDE_ROOT : "flex-1")}
        >
          {current ? (
            <BreadcrumbLink
              className={CRUMB}
              render={<button type="button" />}
              onClick={() => navigate([])}
            >
              {rootLabel}
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage className="block truncate font-medium">
              {rootLabel}
            </BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {depth >= 1 ? (
          <>
            {depth >= 2 ? (
              <BreadcrumbSeparator
                className={
                  depth > 2
                    ? HIDE_ROOT
                    : "hidden @min-[13rem]/object-list-breadcrumb:@max-[22rem]/object-list-breadcrumb:flex"
                }
              />
            ) : null}
            <BreadcrumbItem className={cn("shrink-0", menuVisibility(depth))}>
              <PathMenu
                label={t("Folders above", { note: "object list" })}
                rootLabel={rootLabel}
                folders={trail.slice(0, -1)}
                onNavigate={(index) => navigate(trail.slice(0, index))}
              />
            </BreadcrumbItem>
          </>
        ) : null}
        {parent ? (
          <>
            <BreadcrumbSeparator className={HIDE_PARENT} />
            <BreadcrumbItem className={cn("min-w-0", HIDE_PARENT)}>
              <BreadcrumbLink
                className={CRUMB}
                render={<button type="button" />}
                onClick={() => navigate(trail.slice(0, -1))}
              >
                <bdi>{parent.name}</bdi>
              </BreadcrumbLink>
            </BreadcrumbItem>
          </>
        ) : null}
        {current ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0 flex-1">
              <BreadcrumbPage className="block truncate font-medium">
                <bdi>{current.name}</bdi>
              </BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** The … menu: the root and every folder above the open one. */
function PathMenu({
  label,
  rootLabel,
  folders,
  onNavigate,
}: {
  label: string;
  rootLabel: string;
  folders: readonly ObjectListFolder[];
  /** Opens the folder at this depth: 0 is the root. */
  onNavigate: (depth: number) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className="flex size-6 items-center justify-center rounded-md outline-none hover:bg-dimah-s3-muted hover:text-dimah-s3-foreground focus-visible:ring-2 focus-visible:ring-dimah-s3-ring/50 data-popup-open:bg-dimah-s3-muted"
      >
        <BreadcrumbEllipsis className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-64 min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onNavigate(0)}>
            <HomeIcon aria-hidden />
            <span className="truncate">{rootLabel}</span>
          </DropdownMenuItem>
          {folders.map((folder, index) => (
            <DropdownMenuItem
              key={folder.id}
              onClick={() => onNavigate(index + 1)}
              // Indent by depth so the menu reads as a path.
              style={{ paddingInlineStart: `${0.5 + (index + 1) * 0.75}rem` }}
            >
              <FolderIcon aria-hidden />
              <span className="truncate">
                <bdi>{folder.name}</bdi>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
