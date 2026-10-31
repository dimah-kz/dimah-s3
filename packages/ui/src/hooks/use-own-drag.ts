"use client";

import { useRef, useState, type DragEvent } from "react";

/**
 * Whether files are dragged over this element, from its own drag events.
 *
 * A hook's `isDragActive` is true while files are over any of its drop
 * targets. Gate on `over` so only the target under the pointer shows and
 * announces the drag. Wire `enter`, `leave` and `end` to the element's
 * `onDragEnter`, `onDragLeave` and `onDrop`. Children fire their own enter
 * and leave, so it counts the entered nodes.
 */
export function useOwnDrag() {
  const entered = useRef(new Set<EventTarget>());
  const [over, setOver] = useState(false);

  return {
    over,
    enter(event: DragEvent<HTMLElement>) {
      if (!hasFiles(event)) return;
      entered.current.add(event.target);
      setOver(true);
    },
    leave(event: DragEvent<HTMLElement>) {
      entered.current.delete(event.target);
      if (entered.current.size === 0) setOver(false);
    },
    end() {
      entered.current.clear();
      setOver(false);
    },
  };
}

/** Like react-dropzone: a drag carries files when a type or an item says so. */
function hasFiles({ dataTransfer }: DragEvent<HTMLElement>): boolean {
  if (!dataTransfer) return false;
  return (
    Array.from(dataTransfer.types).includes("Files") ||
    Array.from(dataTransfer.items).some((item) => item.kind === "file")
  );
}
