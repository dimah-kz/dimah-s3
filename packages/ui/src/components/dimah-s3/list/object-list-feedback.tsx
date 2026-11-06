"use client";

import { useCallback, useState } from "react";
import { toast } from "@/components/ui/toast";
import {
  useOptionalObjectListContext,
  type ObjectListFeedback,
} from "@/components/dimah-s3/list/object-list-context";

/**
 * Reports the one-shot results of a list control, such as Copy link. With
 * the list's `toasts` on, or outside a list, each one is a toast. With them
 * off, the list's {@link ObjectListAnnouncer} reads it out. @internal
 */
export function useObjectListFeedback(): (
  feedback: ObjectListFeedback,
) => void {
  const context = useOptionalObjectListContext();
  const announce = context && !context.toasts ? context.announce : null;
  return useCallback(
    (feedback: ObjectListFeedback) => {
      if (announce) announce(feedback);
      else toast.add(feedback);
    },
    [announce],
  );
}

/** The newest feedback for {@link ObjectListAnnouncer}. */
export type ObjectListAnnouncement = {
  /** New for every message, so the same text is read out again. */
  id: number;
  feedback: ObjectListFeedback;
};

/**
 * State behind the list's `announce`: the newest announcement and the
 * function that sets it. @internal
 */
export function useObjectListAnnouncement() {
  const [announcement, setAnnouncement] =
    useState<ObjectListAnnouncement | null>(null);
  const announce = useCallback((feedback: ObjectListFeedback) => {
    setAnnouncement((previous) => ({
      id: (previous?.id ?? 0) + 1,
      feedback,
    }));
  }, []);
  return { announcement, announce };
}

/**
 * The list's polite live region, mounted with the list so a change is read
 * out from the first one. It reads `status`, such as the selection count,
 * whenever it changes, and list feedback while the list's toasts are off.
 * @internal
 */
export function ObjectListAnnouncer({
  announcement,
  status,
}: {
  announcement: ObjectListAnnouncement | null;
  status: string | null;
}) {
  return (
    <div
      data-slot="object-list-announcer"
      className="sr-only"
      aria-live="polite"
    >
      <p data-slot="object-list-status">{status}</p>
      {announcement ? (
        <p key={announcement.id}>
          {announcement.feedback.title}
          {announcement.feedback.description != null ? (
            <> {announcement.feedback.description}</>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
