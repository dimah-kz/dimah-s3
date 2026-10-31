"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useTranslations } from "@fuma-translate/react";
import { fileNameFromKey } from "@dimah-s3/core";
import type {
  DropTargetProps,
  DropzoneRootProps,
  UploadBatchResult,
  UploadCallOptions,
  UploadFileState,
  UploadResult,
  UseUploadReturn,
} from "@dimah-s3/react";
import { cn } from "cn";
import { DismissAttachmentAction } from "@/components/dimah-s3/attachment/dismiss-attachment-action";
import { FileAttachment } from "@/components/dimah-s3/attachment/file-attachment";
import { Upload, useUploadFocus } from "@/components/dimah-s3/upload/upload";

/** Props for {@link UploadField}. */
export type UploadFieldProps = {
  /** The `useUpload` return whose uploads fill the field. */
  upload: UseUploadReturn;
  /** Form field name. Each key submits as its own hidden input. */
  name: string;
  /** Object keys, when you control the value. */
  value?: string[];
  /** Object keys to start with, when the field keeps its own value. */
  defaultValue?: string[];
  /** Runs with the new keys after an upload adds one or `remove` drops one. */
  onValueChange?: (keys: string[]) => void;
  /**
   * Most keys the field holds. Each call takes only the files that still
   * fit, counting files still in flight. A full field takes no files.
   */
  maxFiles?: number;
  children: ReactNode;
};

/** One key of the field value, with what is known about its file. */
export type UploadFieldItem = {
  key: string;
  /** The uploaded file's name, or the last segment of the key. */
  fileName: string;
  /** Verified size in bytes, or `null` for keys the field did not upload. */
  fileSize: number | null;
  contentType: string | null;
};

/** What {@link UploadField} shares with its parts. */
export type UploadFieldContextValue = {
  name: string;
  value: readonly string[];
  /** `value` with file details, in the same order. */
  items: readonly UploadFieldItem[];
  /** Files that still fit, counting files in flight, or `null` without `maxFiles`. */
  remaining: number | null;
  /** Drops `key` from the value. The stored object is kept. */
  remove: (key: string) => void;
};

/** Optional arguments of `getRootProps` and `getDropTargetProps`. */
type CallInput = Parameters<UseUploadReturn["getRootProps"]>[1];

const UploadFieldContext = createContext<UploadFieldContextValue | null>(null);

/** A queue entry that uploaded and has its verified result. */
type UploadedFile = UploadFileState & { result: UploadResult };

function isUploaded(file: UploadFileState): file is UploadedFile {
  return file.phase === "success" && file.result != null;
}

/**
 * Form field whose value is the keys of the files uploaded through it.
 *
 * Each file that uploads successfully adds its key, so the value grows
 * across calls even though the hook replaces its queue. Files that fail,
 * are cancelled or are still in flight add nothing, and files that
 * uploaded before the field mounted are left out. Every key renders as a
 * hidden `<input name={name}>`, so the field submits with its form.
 *
 * It wraps its children in `Upload`, so `UploadTrigger`, `UploadDropzone`
 * and `UploadStatus` work inside it. With `maxFiles`, their calls take at
 * most the files that still fit (files still uploading count), and the hook
 * rejects the rest with `TOO_MANY_FILES`. Once the field is full, its
 * dropzone is `aria-disabled` and the picker, drops and pastes do nothing.
 *
 * @example
 * ```tsx
 * const upload = useUpload({ route: "attachments", maxFiles: 5 });
 *
 * <form action={save}>
 *   <UploadField upload={upload} name="attachments" maxFiles={5}>
 *     <UploadDropzone />
 *     <UploadStatus />
 *     <UploadFieldValue />
 *   </UploadField>
 * </form>
 * ```
 */
export function UploadField({
  upload,
  name,
  value: controlledValue,
  defaultValue,
  onValueChange,
  maxFiles,
  children,
}: UploadFieldProps) {
  const [ownValue, setOwnValue] = useState<string[]>(() => defaultValue ?? []);
  const controlled = controlledValue !== undefined;
  const value = controlled ? controlledValue : ownValue;
  // Files that uploaded before the field mounted are left out.
  const [seen, setSeen] = useState<ReadonlySet<string>>(
    () => new Set(upload.files.filter(isUploaded).map((file) => file.id)),
  );
  const [details, setDetails] = useState<ReadonlyMap<string, UploadFieldItem>>(
    () => new Map(),
  );
  // The newest value for `onValueChange`, reported after it commits.
  const [change, setChange] = useState<{ keys: string[] } | null>(null);

  const setValue = useCallback(
    (next: string[]) => {
      if (!controlled) setOwnValue(next);
      setChange({ keys: next });
    },
    [controlled],
  );

  const uploaded = upload.files.filter(
    (file): file is UploadedFile => isUploaded(file) && !seen.has(file.id),
  );
  if (uploaded.length > 0) {
    // Adjusted while rendering, so new keys show without an extra pass.
    setSeen(new Set([...seen, ...uploaded.map((file) => file.id)]));
    setDetails(withDetails(details, uploaded));
    const fresh = [...new Set(uploaded.map((file) => file.result.key))].filter(
      (key) => !value.includes(key),
    );
    if (fresh.length > 0) setValue([...value, ...fresh]);
  }

  const onValueChangeRef = useRef(onValueChange);
  useEffect(() => {
    onValueChangeRef.current = onValueChange;
  });
  useEffect(() => {
    if (change) onValueChangeRef.current?.(change.keys);
  }, [change]);

  const remove = useCallback(
    (key: string) => setValue(value.filter((item) => item !== key)),
    [setValue, value],
  );

  // Files in flight that the field has not counted yet may still add a key.
  const inFlight = upload.files.filter(
    (file) =>
      file.phase !== "success" && file.phase !== "error" && !seen.has(file.id),
  ).length;
  const remaining =
    maxFiles == null ? null : Math.max(0, maxFiles - value.length - inFlight);
  const fieldUpload = useMemo(
    () => (remaining == null ? upload : capUpload(upload, remaining)),
    [remaining, upload],
  );

  const contextValue = useMemo<UploadFieldContextValue>(
    () => ({
      name,
      value,
      items: value.map(
        (key) =>
          details.get(key) ?? {
            key,
            fileName: fileNameFromKey(key) ?? key,
            fileSize: null,
            contentType: null,
          },
      ),
      remaining,
      remove,
    }),
    [details, name, remaining, remove, value],
  );

  return (
    <UploadFieldContext.Provider value={contextValue}>
      {value.map((key) => (
        <input key={key} type="hidden" name={name} value={key} />
      ))}
      <Upload upload={fieldUpload}>{children}</Upload>
    </UploadFieldContext.Provider>
  );
}

/** The nearest {@link UploadField}. Use it to build your own parts. */
export function useUploadFieldContext(): UploadFieldContextValue {
  const value = useContext(UploadFieldContext);
  if (!value) {
    throw new Error(
      "[dimah-s3] UploadField parts must be rendered inside <UploadField>.",
    );
  }
  return value;
}

/** Props for {@link UploadFieldValue}. Other props go to the `<ul>`. */
export type UploadFieldValueProps = Omit<ComponentProps<"ul">, "children"> & {
  /** Renders one key. Defaults to a file card with a remove action. */
  children?: (item: UploadFieldItem) => ReactNode;
};

/**
 * The keys of the nearest `UploadField`, in order, each with a remove
 * action. Renders nothing while the value is empty.
 */
export function UploadFieldValue({
  children,
  className,
  ...props
}: UploadFieldValueProps) {
  const { items } = useUploadFieldContext();
  if (items.length === 0) return null;

  return (
    <ul
      data-slot="upload-field-value"
      className={cn("flex w-full flex-col gap-2", className)}
      {...props}
    >
      {items.map((item) => (
        <li key={item.key} className="min-w-0">
          {children ? children(item) : <UploadFieldValueItem item={item} />}
        </li>
      ))}
    </ul>
  );
}

function UploadFieldValueItem({ item }: { item: UploadFieldItem }) {
  const t = useTranslations();
  const { remove } = useUploadFieldContext();
  const { keepFocus } = useUploadFocus();

  return (
    <FileAttachment
      state="done"
      fileName={item.fileName}
      fileSize={item.fileSize}
      contentType={item.contentType}
      actions={
        <DismissAttachmentAction
          onDismiss={() => {
            // Focus moves to the next item, else to the field's trigger.
            keepFocus();
            remove(item.key);
          }}
          label={t("Remove {name}", {
            note: "attachment action",
            variables: { name: item.fileName },
          })}
        />
      }
    />
  );
}

/** `details` plus the verified details of `uploaded`, by key. */
function withDetails(
  details: ReadonlyMap<string, UploadFieldItem>,
  uploaded: readonly UploadedFile[],
): ReadonlyMap<string, UploadFieldItem> {
  const next = new Map(details);
  for (const { result, fileName, contentType } of uploaded) {
    next.set(result.key, {
      key: result.key,
      fileName: result.name ?? fileName,
      fileSize: result.size,
      contentType: result.type ?? contentType,
    });
  }
  return next;
}

/**
 * `upload` whose calls take at most `remaining` files. With none left it
 * takes nothing: the picker stays closed, drops and pastes are ignored, and
 * a dropzone is `aria-disabled`.
 */
function capUpload(
  upload: UseUploadReturn,
  remaining: number,
): UseUploadReturn {
  if (remaining === 0) {
    return {
      ...upload,
      handleFiles: () =>
        Promise.resolve<UploadBatchResult>({
          uploaded: [],
          failed: [],
          blocked: [],
          aborted: [],
        }),
      open: () => {},
      getRootProps: <T extends DropzoneRootProps>(props?: T) =>
        ({ ...props, "aria-disabled": true }) as T,
      getDropTargetProps: <T extends object = DropTargetProps>(
        props?: T & DropTargetProps,
      ) => ({ ...props }) as T & DropTargetProps,
    };
  }
  const cap = (call?: UploadCallOptions): UploadCallOptions => ({
    ...call,
    maxFiles: Math.min(call?.maxFiles ?? remaining, remaining),
  });
  const capInput = (call: CallInput): CallInput =>
    typeof call === "function" ? () => cap(call()) : cap(call);

  return {
    ...upload,
    handleFiles: (files, call) => upload.handleFiles(files, cap(call)),
    open: (call) => upload.open(cap(call)),
    getRootProps: (props, call) => upload.getRootProps(props, capInput(call)),
    getDropTargetProps: (props, call) =>
      upload.getDropTargetProps(props, capInput(call)),
  };
}
