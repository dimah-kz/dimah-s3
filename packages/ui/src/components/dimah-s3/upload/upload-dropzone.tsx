"use client";

import {
  createContext,
  useContext,
  useId,
  useMemo,
  type DragEvent,
  type HTMLAttributes,
} from "react";
import { BanIcon, CloudUpload, FileUpIcon } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import type { DropzoneRootProps, UploadCallOptions } from "@dimah-s3/react";
import { cn } from "cn";
import {
  useUploadCall,
  useUploadContext,
  useUploadFocus,
} from "@/components/dimah-s3/upload/upload";
import { UploadStatus } from "@/components/dimah-s3/upload/upload-status";
import { useOwnDrag } from "@/hooks/use-own-drag";
import { useUploadHints } from "@/lib/upload-hints";

/** What {@link UploadDropzone} shares with its trigger. */
type DropzoneContextValue = {
  /** The dropzone's call, already merged with the open folder of a list. */
  call: UploadCallOptions | undefined;
  /** Files are dragged over this dropzone. */
  dragActive: boolean;
  /** The dragged files break `accept` or `maxFiles`. */
  dragReject: boolean;
};

const DropzoneContext = createContext<DropzoneContextValue | null>(null);

/** Props for {@link UploadDropzone}. Other props go to the dropzone `<div>`. */
export type UploadDropzoneProps = HTMLAttributes<HTMLDivElement> & {
  /** Call options for the files dropped on it, and picked or pasted through its trigger. */
  call?: UploadCallOptions;
};

/**
 * Drop area of the nearest `Upload`. Render it inside `<Upload>`.
 *
 * Files dropped anywhere on it upload, also over the status inside it. Its
 * drag state follows only the files over this element, not the whole hook,
 * and a polite live region announces whether they can be dropped. It stays
 * usable while files upload, so new files follow the hook's `queue` option.
 *
 * Without `children` it renders an `UploadDropzoneTrigger` and an
 * `UploadStatus`, so progress shows inside the dropzone. Pass `children`
 * to arrange them yourself, or to keep the status outside it.
 *
 * It sets `data-drag-active` while files are over it, `data-drag-reject`
 * when they cannot be dropped, and `data-disabled` while the hook is
 * disabled or the root is full.
 *
 * @example
 * ```tsx
 * <Upload upload={upload}>
 *   <UploadDropzone />
 * </Upload>
 * ```
 */
export function UploadDropzone({
  call,
  className,
  children,
  onDragEnter,
  onDragLeave,
  onDrop,
  ...props
}: UploadDropzoneProps) {
  const t = useTranslations();
  const { upload, isFull } = useUploadContext();
  const uploadCall = useUploadCall(upload, call);
  const drag = useOwnDrag();
  const disabled = upload.disabled || isFull;

  // The hook's verdict, for the drag that is over this element.
  const dragActive = drag.over && upload.isDragActive;
  const dragReject = dragActive && upload.isDragReject;
  const dragMessage = dragActive
    ? dragReject
      ? t("These files cannot be uploaded", { note: "dropzone" })
      : t("Drop to upload", { note: "dropzone" })
    : "";

  const context = useMemo<DropzoneContextValue>(
    () => ({ call: uploadCall, dragActive, dragReject }),
    [dragActive, dragReject, uploadCall],
  );

  return (
    <DropzoneContext.Provider value={context}>
      <div
        // The hook keeps `data-drag-active` on a drop target itself.
        {...upload.getDropTargetProps(
          {
            "data-slot": "upload-dropzone",
            "data-drag-reject": dragReject || undefined,
            "data-disabled": disabled || undefined,
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
              "group/upload-dropzone flex w-full min-w-0 flex-col gap-1 rounded-xl border-2 border-dashed border-dimah-s3-border bg-dimah-s3-background p-1 transition-colors",
              "has-[[data-slot=upload-dropzone-trigger]:hover:not([aria-disabled=true])]:border-dimah-s3-primary/40",
              "not-data-drag-reject:data-drag-active:border-dimah-s3-primary not-data-drag-reject:data-drag-active:bg-dimah-s3-primary/5",
              "data-drag-reject:border-dimah-s3-destructive data-drag-reject:bg-dimah-s3-destructive/5",
              // Status inside the dropzone sits clear of the dashed border.
              "*:data-[slot=upload-status]:px-1 *:data-[slot=upload-status]:pb-1",
              className,
            ),
          },
          uploadCall,
        )}
      >
        {children ?? (
          <>
            <UploadDropzoneTrigger />
            <UploadStatus />
          </>
        )}
      </div>
      <div className="sr-only" aria-live="polite">
        {dragMessage}
      </div>
    </DropzoneContext.Provider>
  );
}

/** Props for {@link UploadDropzoneTrigger}. Other props go to the trigger `<div>`. */
export type UploadDropzoneTriggerProps = HTMLAttributes<HTMLDivElement>;

/**
 * The part of an `UploadDropzone` that opens the file picker. Render it
 * inside `<UploadDropzone>`.
 *
 * It is a button: a click, Enter or Space opens the picker, and files
 * pasted while it has focus upload. The route's limits describe it. While
 * the hook is disabled it is `aria-disabled` and out of the tab order;
 * while the root is full, as in a full `UploadField`, it stays focusable
 * but is `aria-disabled`, and "Maximum files reached." leads its
 * description.
 *
 * The default content is an icon, a title that follows the drag, and the
 * route's limits. `children` replace them; the limits stay attached as the
 * description. It is a button, so do not put controls inside it.
 */
export function UploadDropzoneTrigger({
  className,
  children,
  "aria-describedby": describedBy,
  ...props
}: UploadDropzoneTriggerProps) {
  const t = useTranslations();
  const { upload, isFull } = useUploadContext();
  const { intakeProps } = useUploadFocus();
  const dropzone = useContext(DropzoneContext);
  if (!dropzone) {
    throw new Error(
      "[dimah-s3] UploadDropzoneTrigger must be rendered inside <UploadDropzone>.",
    );
  }
  const { call, dragActive, dragReject } = dropzone;
  const hints = useUploadHints(upload.policy);
  const labelId = useId();
  const hintsId = useId();
  const fullHint = isFull
    ? t("Maximum files reached.", { note: "dropzone hint" })
    : null;
  const hintLines = [fullHint, hints.limits, hints.accept].filter(
    (line) => line != null,
  );
  const hasHints = hintLines.length > 0;
  const custom = children != null;

  const title = dragActive
    ? dragReject
      ? t("These files cannot be uploaded", { note: "dropzone" })
      : t("Drop to upload", { note: "dropzone" })
    : upload.policy.maxFiles > 1
      ? t("Drag and drop files here", { note: "dropzone" })
      : t("Drag and drop a file here", { note: "dropzone" });
  const Icon = dragReject ? BanIcon : dragActive ? FileUpIcon : CloudUpload;

  const rootProps = withoutDrag(
    upload.getRootProps<DropzoneRootProps>(
      {
        role: "button",
        "aria-labelledby": custom || props["aria-label"] ? undefined : labelId,
        "aria-describedby":
          [hasHints ? hintsId : null, describedBy].filter(Boolean).join(" ") ||
          undefined,
        "aria-busy": upload.isPending || undefined,
        // Only when full: an `undefined` would hide the hook's own.
        ...(isFull ? { "aria-disabled": true } : null),
        "data-slot": "upload-dropzone-trigger",
        ...intakeProps,
        ...props,
        className: cn(
          "flex min-h-32 flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg p-6 text-center transition-colors outline-none",
          "hover:bg-dimah-s3-muted/50 focus-visible:ring-3 focus-visible:ring-dimah-s3-ring/50",
          // Shorter while the status inside the dropzone shows.
          "group-has-[[data-slot=upload-status]]/upload-dropzone:min-h-0 group-has-[[data-slot=upload-status]]/upload-dropzone:py-4",
          "aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent",
          className,
        ),
      },
      call,
    ),
  );

  return (
    <div {...rootProps}>
      {custom ? (
        <>
          {children}
          {hasHints ? (
            <span id={hintsId} hidden>
              {hintLines.join(" ")}
            </span>
          ) : null}
        </>
      ) : (
        <>
          <span
            aria-hidden
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full border border-dimah-s3-border bg-dimah-s3-card text-dimah-s3-muted-foreground shadow-xs transition-colors",
              dragActive &&
                (dragReject
                  ? "border-dimah-s3-destructive/30 bg-dimah-s3-destructive/10 text-dimah-s3-destructive"
                  : "border-dimah-s3-primary/30 bg-dimah-s3-primary/10 text-dimah-s3-primary"),
            )}
          >
            <Icon className="pointer-events-none size-5" strokeWidth={1.75} />
          </span>
          <div className="flex flex-col gap-1">
            <p
              id={labelId}
              className={cn(
                "text-sm font-medium text-dimah-s3-foreground",
                dragReject && "text-dimah-s3-destructive",
              )}
            >
              {title}
            </p>
            {hasHints ? (
              <div
                id={hintsId}
                className="flex flex-col gap-0.5 text-xs text-dimah-s3-muted-foreground"
              >
                {hintLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/** The dropzone takes the drag, so its trigger keeps click, keys and paste. */
function withoutDrag(props: DropzoneRootProps): DropzoneRootProps {
  const { onDragEnter, onDragOver, onDragLeave, onDrop, ...rest } = props;
  return rest;
}
