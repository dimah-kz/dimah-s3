"use client";

import { Fragment } from "react";
import type { ObjectListFolder } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Trailing folders kept inline. Earlier ones collapse into a menu. */
const VISIBLE_TRAIL = 2;

function splitObjectListTrail(trail: readonly ObjectListFolder[]) {
  if (trail.length <= VISIBLE_TRAIL) {
    return { hidden: [] as readonly ObjectListFolder[], visible: trail };
  }
  return {
    hidden: trail.slice(0, -VISIBLE_TRAIL),
    visible: trail.slice(-VISIBLE_TRAIL),
  };
}

export function ObjectListBreadcrumb({
  rootLabel,
  trail,
  navigate,
}: {
  rootLabel: string;
  trail: readonly ObjectListFolder[];
  navigate?: (trail: readonly ObjectListFolder[]) => void;
}) {
  const t = useTranslations();
  const atRoot = trail.length === 0;
  const { hidden, visible } = splitObjectListTrail(trail);

  return (
    <Breadcrumb className="min-w-0 flex-1">
      <BreadcrumbList className="min-w-0 flex-nowrap">
        <BreadcrumbItem className="min-w-0">
          {atRoot || navigate == null ? (
            <BreadcrumbPage className="max-w-40 truncate sm:max-w-56">
              {rootLabel}
            </BreadcrumbPage>
          ) : (
            <BreadcrumbLink
              className="max-w-40 truncate sm:max-w-56"
              render={<button type="button" />}
              onClick={() => navigate([])}
            >
              {rootLabel}
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {hidden.length > 0 ? (
          <Fragment>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1">
                  <BreadcrumbEllipsis className="size-4" />
                  <span className="sr-only">
                    {t("Earlier folders", { note: "object list" })}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="max-w-64 min-w-48"
                >
                  <DropdownMenuGroup>
                    {hidden.map((folder, index) => (
                      <DropdownMenuItem
                        key={folder.id}
                        disabled={navigate == null}
                        onClick={() => navigate?.(trail.slice(0, index + 1))}
                      >
                        <span className="truncate">
                          <bdi>{folder.name}</bdi>
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
          </Fragment>
        ) : null}
        {visible.map((folder, index) => {
          const trailIndex = hidden.length + index;
          const current = trailIndex === trail.length - 1;
          return (
            <Fragment key={folder.id}>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                {current || navigate == null ? (
                  <BreadcrumbPage className="max-w-40 truncate sm:max-w-56">
                    <bdi>{folder.name}</bdi>
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    className="max-w-40 truncate sm:max-w-56"
                    render={<button type="button" />}
                    onClick={() => navigate(trail.slice(0, trailIndex + 1))}
                  >
                    <bdi>{folder.name}</bdi>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
