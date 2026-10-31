"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon, UserIcon } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import type { S3Api, S3RouteName } from "@dimah-s3/core";
import {
  useFormatDimahError,
  type UploadFileState,
  type UploadResult,
  type UseUploadReturn,
} from "@dimah-s3/react";
import { CircleProgress } from "@/components/dimah-s3/attachment/circle-progress";
import { ObjectImage } from "@/components/dimah-s3/preview/object-image";
import { Upload } from "@/components/dimah-s3/upload/upload";

/** Props for {@link AvatarUpload}. */
export type AvatarUploadProps = {
  /** The `useUpload` return that uploads the picked image. */
  upload: UseUploadReturn;
  /** Named server route that presigns the GET for `objectKey`. */
  route: S3RouteName;
  /** Key of the current image. `null` or absent shows a placeholder. */
  objectKey?: string | null;
  /** Accessible name of the button, such as "Change profile photo". */
  label: string;
  /** Runs once per uploaded image. Store `result.key` and pass it back as `objectKey`. */
  onChange?: (result: UploadResult) => void;
  /** Width and height in pixels. @default 96 */
  size?: number;
  /** Signs the image URL. Optional when an `<S3Provider>` is in the tree. */
  api?: S3Api;
};

const IN_FLIGHT = new Set<UploadFileState["phase"]>([
  "queued",
  "preparing",
  "presigning",
  "uploading",
  "finalizing",
]);

function isUploaded(
  file: UploadFileState,
): file is UploadFileState & { result: UploadResult } {
  return file.phase === "success" && file.result != null;
}

/**
 * Round image button that uploads a new picture. A click opens the file
 * picker, and an image dropped on it uploads too. It is disabled while the
 * hook is (`upload.disabled`).
 *
 * It shows the picked file's preview while it uploads and after, with a
 * progress ring while it is in flight. Otherwise it shows `objectKey`, or a
 * placeholder. A polite live region announces the upload phase, errors
 * and rejected files.
 *
 * @example
 * ```tsx
 * const upload = useUpload({ route: "avatars", accept: ["image/*"] });
 *
 * <AvatarUpload
 *   upload={upload}
 *   route="avatars"
 *   objectKey={user.avatarKey}
 *   label="Change profile photo"
 *   onChange={(result) => saveAvatar(result.key)}
 * />
 * ```
 */
export function AvatarUpload({
  upload,
  route,
  objectKey = null,
  label,
  onChange,
  size = 96,
  api,
}: AvatarUploadProps) {
  const { file } = upload;
  const inFlight = file != null && IN_FLIGHT.has(file.phase);
  const previewUrl =
    file?.phase === "error" ? null : (file?.previewUrl ?? null);
  const announcement = useAnnouncement(upload);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  // Images that uploaded before the avatar mounted are not reported.
  const [reported] = useState(
    () => new Set(upload.files.filter(isUploaded).map((item) => item.id)),
  );
  useEffect(() => {
    for (const item of upload.files) {
      if (!isUploaded(item) || reported.has(item.id)) continue;
      reported.add(item.id);
      onChangeRef.current?.(item.result);
    }
  }, [reported, upload.files]);

  const image = "size-full object-cover";
  const placeholder = (
    <UserIcon className="size-1/2" strokeWidth={1.5} aria-hidden />
  );

  return (
    <Upload upload={upload}>
      <div
        data-slot="avatar-upload"
        className="relative inline-flex shrink-0"
        style={{ width: size, height: size }}
      >
        <button
          {...upload.getDropTargetProps({
            type: "button",
            disabled: upload.disabled,
            "aria-label": label,
            "aria-busy": inFlight || undefined,
            onClick: () => upload.open(),
            className:
              "flex size-full cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dimah-s3-border bg-dimah-s3-muted text-dimah-s3-muted-foreground transition-colors outline-none hover:border-dimah-s3-primary/50 focus-visible:border-dimah-s3-ring focus-visible:ring-3 focus-visible:ring-dimah-s3-ring/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-dimah-s3-border data-drag-active:border-dimah-s3-primary data-drag-active:ring-3 data-drag-active:ring-dimah-s3-primary/30",
          })}
        >
          {previewUrl ? (
            <img src={previewUrl} alt="" className={image} />
          ) : (
            <ObjectImage
              api={api}
              route={route}
              objectKey={objectKey}
              alt=""
              className={image}
              fallback={placeholder}
            />
          )}
        </button>
        {inFlight ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-dimah-s3-background/60">
            <CircleProgress
              percent={file.progress.percent}
              fileName={file.fileName}
              className="size-1/3"
            />
          </div>
        ) : (
          <span
            className="pointer-events-none absolute end-0 bottom-0 flex size-7 items-center justify-center rounded-full border border-dimah-s3-border bg-dimah-s3-card text-dimah-s3-card-foreground shadow-sm"
            aria-hidden
          >
            <CameraIcon className="size-3.5" />
          </span>
        )}
        <span className="sr-only" aria-live="polite">
          {announcement}
        </span>
      </div>
    </Upload>
  );
}

/** What the live region says about the newest call. */
function useAnnouncement(upload: UseUploadReturn): string {
  const t = useTranslations();
  const formatError = useFormatDimahError();
  const rejection = upload.fileRejections[0]?.errors[0];
  if (rejection) return formatError(rejection);

  const { file } = upload;
  if (!file) {
    return upload.isPending ? t("Preparing…", { note: "upload status" }) : "";
  }
  switch (file.phase) {
    case "success":
      return t("Upload complete", { note: "upload status" });
    case "error":
      return file.error
        ? formatError(file.error)
        : t("Upload failed", { note: "status" });
    default:
      return t("Uploading…", { note: "upload status" });
  }
}
