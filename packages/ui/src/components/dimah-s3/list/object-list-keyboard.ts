"use client";

import { useRef, type FocusEvent, type KeyboardEvent } from "react";
import type {
  UseObjectListReturn,
  UseObjectListSelectionReturn,
} from "@dimah-s3/react";
import type {
  ObjectListEntryStore,
  ObjectListView,
} from "@/components/dimah-s3/list/object-list-context";
import { canRenameEntry } from "@/components/dimah-s3/list/object-list-rename";
import { isFieldTarget } from "@/lib/is-field-target";

const ENTRY = "[data-slot=object-list-entry]";
const TRIGGER = "[data-slot=object-list-entry-trigger]";
const RENAME = "[data-slot=object-list-rename]";
const ENTRIES_START = "[data-slot=object-list-entries-start]";
const ENTRIES_END = "[data-slot=object-list-entries-end]";
/** What can take focus inside an entry, before the checks in {@link entryControls}. */
const CONTROL =
  "button, a[href], input, select, textarea, [role=checkbox], [tabindex]";

/**
 * Keys inside the list frame:
 * - The entries are one tab stop: the last entry focused, else the first.
 *   Tab and Shift+Tab move through that entry's own controls, then leave
 *   the entries.
 * - Arrows, Home, End: move between entries (grid: by row and column).
 * - ArrowLeft, ArrowRight in the list view: move between a row's checkbox,
 *   name, and menu.
 * - Space on an entry: toggle its checkbox. Shift extends the range.
 * - Ctrl+A / Cmd+A: select every loaded entry. Escape: clear.
 * - Backspace or Alt+ArrowUp: open the parent folder.
 * - F2: rename the focused row, when the source can.
 *
 * Fields, menus, and dialogs keep their own keys.
 */
export function useObjectListKeyboard<TItem>({
  list,
  selection,
  view,
  store,
  startRename,
}: {
  list: UseObjectListReturn<TItem>;
  selection: UseObjectListSelectionReturn<TItem> | null;
  view: ObjectListView;
  store: ObjectListEntryStore;
  startRename: (key: string) => void;
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
    const entry = entryOf(frame, target);

    if (event.key === "Tab") {
      // The rename field keeps the browser's order.
      if (!entry || modifier || event.altKey || target.closest(RENAME)) return;
      tabFrom(frame, entry, target, event);
      return;
    }
    if (event.key === "Escape") {
      if (!selection?.isSelecting) return;
      event.preventDefault();
      selection.clear();
      return;
    }
    if (isSelectAllKey(event) && modifier && !event.altKey && !event.shiftKey) {
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
    if (event.key === "F2" && !modifier && !event.altKey && !event.shiftKey) {
      const key = entry?.dataset.entryKey;
      const found = key ? list.entries.find((item) => item.key === key) : null;
      if (!found || !canRenameEntry(found, list)) return;
      event.preventDefault();
      startRename(found.key);
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
    const rtl = getComputedStyle(frame).direction === "rtl";
    if (
      view === "list" &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      if (!entry) return;
      event.preventDefault();
      const forward = event.key === "ArrowRight" ? !rtl : rtl;
      moveWithinEntry(entry, target, forward ? 1 : -1);
      return;
    }
    const step = focusStep(event.key, frame, view, rtl);
    if (step == null) return;
    event.preventDefault();
    moveFocus(frame, target, step);
  }

  function onKeyUp(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== " " || !spaceRef.current) return;
    spaceRef.current = false;
    event.preventDefault();
  }

  /** The entry that takes focus becomes the tab stop. */
  function onFocus(event: FocusEvent<HTMLElement>) {
    if (!(event.target instanceof HTMLElement)) return;
    const key = entryOf(event.currentTarget, event.target)?.dataset.entryKey;
    if (key) store.set({ tabStop: key });
  }

  return { onKeyDown, onKeyUp, onFocus };
}

type Step = number | "first" | "last";

function focusStep(
  key: string,
  frame: HTMLElement,
  view: ObjectListView,
  rtl: boolean,
): Step | null {
  const columns = view === "grid" ? gridColumns(frame) : 1;
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

/** The entry in `frame` that holds `target`. */
function entryOf(frame: HTMLElement, target: HTMLElement): HTMLElement | null {
  const entry = target.closest<HTMLElement>(ENTRY);
  return entry && frame.contains(entry) ? entry : null;
}

/** The controls of an entry that can take focus, in document order. */
function entryControls(entry: HTMLElement): HTMLElement[] {
  return [...entry.querySelectorAll<HTMLElement>(CONTROL)].filter(
    (control) =>
      !control.matches(":disabled") &&
      control.getAttribute("aria-hidden") !== "true" &&
      !(control instanceof HTMLInputElement && control.type === "hidden") &&
      !control.closest("[inert], [hidden]"),
  );
}

/** One control further along the entry, without wrapping. */
function moveWithinEntry(
  entry: HTMLElement,
  target: HTMLElement,
  step: 1 | -1,
) {
  const controls = entryControls(entry);
  const index = controls.findIndex((control) => control.contains(target));
  if (index < 0) return;
  controls[index + step]?.focus();
}

/**
 * Tab from inside an entry: the entry's next control, else out of the
 * entries. Leaving puts focus on the edge before or after them, and the
 * browser's own Tab moves on from there.
 */
function tabFrom(
  frame: HTMLElement,
  entry: HTMLElement,
  target: HTMLElement,
  event: KeyboardEvent<HTMLElement>,
) {
  const controls = entryControls(entry);
  const index = controls.indexOf(target);
  const next =
    index < 0 ? undefined : controls[index + (event.shiftKey ? -1 : 1)];
  if (next) {
    event.preventDefault();
    next.focus();
    return;
  }
  frame
    .querySelector<HTMLElement>(event.shiftKey ? ENTRIES_START : ENTRIES_END)
    ?.focus({ preventScroll: true });
}

function isOverlayTarget(target: Element) {
  return Boolean(
    target.closest(
      "[role=dialog], [role=alertdialog], [role=menu], [data-slot=dropdown-menu-content], [data-slot=alert-dialog-content]",
    ),
  );
}

/**
 * The A key of the user's layout (AZERTY puts it where QWERTY has Q). A
 * layout without Latin letters falls back to the physical key.
 */
function isSelectAllKey(event: KeyboardEvent<HTMLElement>): boolean {
  if (/^[a-z]$/i.test(event.key)) return event.key.toLowerCase() === "a";
  return event.code === "KeyA";
}
