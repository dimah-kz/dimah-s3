"use client";

import {
  useId,
  useRef,
  useState,
  type DragEvent,
  type HTMLAttributes,
} from "react";
import { CloudUpload } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import type { UploadCallOptions } from "@dimah-s3/react";
import { cn } from "cn";
import {
  useUploadCall,
  useUploadContext,
  useUploadFocus,
} from "@/components/dimah-s3/upload/upload";
import { useUploadHints } from "@/lib/upload-hints";

/** Props for {@link UploadDropzone}. Other props go to the dropzone element. */
export type UploadDropzoneProps = HTMLAttributes<HTMLDivElement> & {
  /** Call options for the dropped, pasted and picked files. */
  call?: UploadCallOptions;
};

/**
 * Drop area of the nearest `Upload`. Render it inside `<Upload>`.
 *
 * It takes dropped files, files pasted while it has focus, and a click,
 * Enter or Space to open the picker. It is a button described by the
 * route's limits, and a polite live region announces whether dragged files
 * can be dropped. Its drag state follows only the files over this element,
 * not the whole hook, so other drop targets of the hook stay quiet. It
 * stays usable while files upload, so new files follow the hook's `queue`
 * option.
 *
 * `children` replace the icon and text. The dropzone is a button, so do not
 * put controls inside it: render `UploadStatus` next to it instead.
 */
export function UploadDropzone({
  call,
  className,
  children,
  "aria-describedby": describedBy,
  onDragEnter,
  onDragLeave,
  onDrop,
  ...props
}: UploadDropzoneProps) {
  const t = useTranslations();
  const { upload } = useUploadContext();
  const uploadCall = useUploadCall(upload, call);
  const { intakeProps } = useUploadFocus();
  const drag = useOwnDrag();
  const hints = useUploadHints(upload.policy);
  const labelId = useId();
  const hintsId = useId();
  const hasHints = hints.limits != null || hints.accept != null;
  const custom = children != null;

  // The hook's verdict, for the drag that is over this element.
  const dragActive = drag.over && upload.isDragActive;
  const dragReject = dragActive && upload.isDragReject;
  const dragMessage = dragActive
    ? dragReject
      ? t("These files cannot be uploaded", { note: "dropzone" })
      : t("Drop to upload", { note: "dropzone" })
    : "";

  return (
    <>
      <div
        {...upload.getRootProps(
          {
            role: "button",
            "aria-labelledby":
              custom || props["aria-label"] ? undefined : labelId,
            "aria-describedby":
              [hasHints ? hintsId : null, describedBy]
                .filter(Boolean)
                .join(" ") || undefined,
            "aria-busy": upload.isPending || undefined,
            "data-slot": "upload-dropzone",
            "data-drag-active": dragActive || undefined,
            "data-drag-reject": dragReject || undefined,
            ...intakeProps,
            ...props,
            onDragEnter: (event: DragEvent<HTMLDivElement>) => {
              onDragEnter?.(event);
              drag.enter(event);
            },
            onDragLeave: (event: DragEvent<HTMLDivElement>) => {
              onDragLeave?.(event);
              drag.leave(event);
            },
            onDrop: (event: DragEvent<HTMLDivElement>) => {
              onDrop?.(event);
              drag.end();
            },
            className: cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-dimah-s3-muted-foreground/25 p-6 text-center transition-colors outline-none",
              "hover:border-dimah-s3-primary/50 focus-visible:border-dimah-s3-ring focus-visible:ring-3 focus-visible:ring-dimah-s3-ring/50",
              "data-drag-active:border-dimah-s3-primary data-drag-active:bg-dimah-s3-primary/5",
              "data-drag-reject:border-dimah-s3-destructive data-drag-reject:bg-dimah-s3-destructive/5",
              "aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:border-dimah-s3-muted-foreground/25",
              className,
            ),
          },
          uploadCall,
        )}
      >
        {custom ? (
          <>
            {children}
            {hasHints ? (
              <span id={hintsId} hidden>
                {[hints.limits, hints.accept].filter(Boolean).join(" ")}
              </span>
            ) : null}
          </>
        ) : (
          <>
            <CloudUpload
              className="size-6 text-dimah-s3-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
            <div className="flex flex-col gap-1">
              <p id={labelId} className="text-sm font-medium">
                {t("Drag and drop files here", { note: "dropzone" })}
              </p>
              {hasHints ? (
                <div
                  id={hintsId}
                  className="flex flex-col gap-1 text-xs text-dimah-s3-muted-foreground"
                >
                  {hints.limits ? <p>{hints.limits}</p> : null}
                  {hints.accept ? <p>{hints.accept}</p> : null}
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
      <div className="sr-only" aria-live="polite">
        {dragMessage}
      </div>
    </>
  );
}

/**
 * Whether files are dragged over this element, from its own drag events.
 * Children fire their own enter and leave, so it counts the entered nodes.
 */
function useOwnDrag() {
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
