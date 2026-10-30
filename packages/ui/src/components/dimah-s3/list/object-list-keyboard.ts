"use client";

import { useRef, type KeyboardEvent } from "react";
import type {
  UseObjectListReturn,
  UseObjectListSelectionReturn,
} from "@dimah-s3/react";
import type { ObjectListView } from "@/components/dimah-s3/list/object-list-context";

const ENTRY = "[data-slot=object-list-entry]";
const TRIGGER = "[data-slot=object-list-entry-trigger]";

/**
 * Keys inside the list frame:
 * - Arrows, Home, End: move between entries (grid: by row and column).
 * - Space on an entry: toggle its checkbox. Shift extends the range.
 * - Ctrl+A / Cmd+A: select every loaded entry. Escape: clear.
 * - Backspace or Alt+ArrowUp: open the parent folder.
 *
 * Fields, menus, and dialogs keep their own keys.
 */
export function useObjectListKeyboard<TItem>({
  list,
  selection,
  view,
}: {
  list: UseObjectListReturn<TItem>;
  selection: UseObjectListSelectionReturn<TItem> | null;
  view: ObjectListView;
}) {
  // Space toggles on keydown; swallow the keyup so the button does not open.
  const spaceRef = useRef(false);

  function selectableKey(target: HTMLElement): string | null {
    if (!selection || !target.matches(TRIGGER)) return null;
    const key = target.dataset.entryKey;
    const entry = key ? list.entries.find((item) => item.key === key) : null;
    return entry && selection.canSelect(entry) ? entry.key : null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented) return;
    const target = event.target;
    const frame = event.currentTarget;
    // Portalled menus bubble through React, not through the DOM.
    if (!(target instanceof HTMLElement) || !frame.contains(target)) return;
    if (isFieldTarget(target) || isOverlayTarget(target)) return;
    const modifier = event.ctrlKey || event.metaKey;

    if (event.key === "Escape") {
      if (!selection?.isSelecting) return;
      event.preventDefault();
      selection.clear();
      return;
    }
    if (event.code === "KeyA" && modifier && !event.altKey && !event.shiftKey) {
      if (!selection || selection.mode !== "multiple") return;
      if (selection.selectableCount === 0) return;
      event.preventDefault();
      selection.selectAll();
      return;
    }
    if (
      (event.key === "Backspace" && !modifier && !event.altKey) ||
      (event.key === "ArrowUp" && event.altKey)
    ) {
      if (list.trail.length === 0) return;
      event.preventDefault();
      list.goUp();
      return;
    }
    if (event.key === " " && !modifier) {
      const key = selectableKey(target);
      if (!key || !selection) return;
      event.preventDefault();
      spaceRef.current = true;
      selection.toggle(key, { range: event.shiftKey });
      return;
    }
    if (modifier || event.altKey) return;
    const step = focusStep(event.key, frame, view);
    if (step == null) return;
    event.preventDefault();
    moveFocus(frame, target, step);
  }

  function onKeyUp(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== " " || !spaceRef.current) return;
    spaceRef.current = false;
    event.preventDefault();
  }

  return { onKeyDown, onKeyUp };
}

type Step = number | "first" | "last";

function focusStep(
  key: string,
  frame: HTMLElement,
  view: ObjectListView,
): Step | null {
  const columns = view === "grid" ? gridColumns(frame) : 1;
  const rtl = getComputedStyle(frame).direction === "rtl";
  switch (key) {
    case "ArrowDown":
      return columns;
    case "ArrowUp":
      return -columns;
    case "ArrowRight":
      return view === "grid" ? (rtl ? -1 : 1) : null;
    case "ArrowLeft":
      return view === "grid" ? (rtl ? 1 : -1) : null;
    case "Home":
      return "first";
    case "End":
      return "last";
    default:
      return null;
  }
}

function gridColumns(frame: HTMLElement): number {
  const grid = frame.querySelector<HTMLElement>(
    "[data-slot=object-list-entries]",
  );
  if (!grid) return 1;
  const template = getComputedStyle(grid).gridTemplateColumns;
  return Math.max(1, template.split(" ").filter(Boolean).length);
}

function moveFocus(frame: HTMLElement, target: HTMLElement, step: Step) {
  const triggers = [...frame.querySelectorAll<HTMLElement>(TRIGGER)];
  if (triggers.length === 0) return;
  const entry = target.closest(ENTRY);
  const current = entry
    ? triggers.findIndex((trigger) => entry.contains(trigger))
    : -1;
  let next: number;
  if (step === "first") next = 0;
  else if (step === "last") next = triggers.length - 1;
  else if (current < 0) next = step > 0 ? 0 : triggers.length - 1;
  else next = Math.min(triggers.length - 1, Math.max(0, current + step));
  const trigger = triggers[next];
  trigger?.focus();
  trigger?.scrollIntoView({ block: "nearest" });
}

export function isFieldTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

function isOverlayTarget(target: Element) {
  return Boolean(
    target.closest(
      "[role=dialog], [role=alertdialog], [role=menu], [data-slot=dropdown-menu-content], [data-slot=alert-dialog-content]",
    ),
  );
}
