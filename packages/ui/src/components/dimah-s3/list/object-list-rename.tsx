"use client";

import { useEffect, useId, useRef, useState, type FocusEvent, type FormEvent } from "react";
import {
  useFormatDimahError,
  type ObjectListEntry,
  type UseObjectListReturn,
} from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { CheckIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { splitFileName } from "@/components/dimah-s3/attachment/file-name";
import { useObjectListContext } from "@/components/dimah-s3/list/object-list-context";

/** True when the source can rename this entry. */
export function canRenameEntry<TItem>(
  entry: ObjectListEntry<TItem>,
  list: UseObjectListReturn<TItem>,
): boolean {
  return entry.kind === "file"
    ? list.renameFile != null
    : list.renameFolder != null;
}

/**
 * The name field for the entry being renamed. Enter saves, Escape restores
 * the name, and leaving the field saves. Mounted by the default row and tile.
 */
export function ObjectListRenameField<TItem>({
  entry,
}: {
  entry: ObjectListEntry<TItem>;
}) {
  const t = useTranslations();
  const formatError = useFormatDimahError();
  const { list, cancelRename } = useObjectListContext<TItem>();
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const closed = useRef(false);
  const [name, setName] = useState(entry.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const folder = entry.kind === "folder";
  const label = folder
    ? t("Folder name", { note: "object list new folder" })
    : t("File name", { note: "object list rename" });

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const end = folder ? entry.name.length : splitFileName(entry.name).stem.length;
    input.setSelectionRange(0, end);
  }, [entry.name, folder]);

  function finish(focus: boolean) {
    if (closed.current) return;
    closed.current = true;
    cancelRename(focus);
  }

  async function save(focus: boolean) {
    if (closed.current || lock.current) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError(
        folder
          ? t("Enter a folder name", { note: "object list new folder" })
          : t("Enter a file name", { note: "object list rename" }),
      );
      return;
    }
    if (trimmed === entry.name) {
      finish(focus);
      return;
    }
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      if (entry.kind === "folder") {
        await list.renameFolder?.(entry.folder, trimmed);
      } else {
        await list.renameFile?.(entry.item, trimmed);
      }
    } catch (err) {
      lock.current = false;
      setPending(false);
      setError(formatError(err));
      inputRef.current?.focus();
      return;
    }
    finish(focus);
  }

  function onBlur(event: FocusEvent<HTMLFormElement>) {
    if (closed.current || lock.current) return;
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    const trimmed = name.trim();
    // An empty name is not a rename. Restore the row.
    if (!trimmed || trimmed === entry.name) {
      finish(false);
      return;
    }
    void save(false);
  }

  const confirm = (
    <Button
      type="submit"
      variant="ghost"
      size="icon-sm"
      className="shrink-0"
      aria-label={t("Rename", { note: "object list menu" })}
      disabled={pending}
      focusableWhenDisabled
      onMouseDown={(event) => event.preventDefault()}
    >
      {pending ? <Spinner /> : <CheckIcon />}
    </Button>
  );
  const cancel = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="shrink-0"
      aria-label={t("Cancel", { note: "object list rename" })}
      disabled={pending}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => finish(true)}
    >
      <XIcon />
    </Button>
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(true);
  }

  return (
    <form
      data-slot="object-list-rename"
      aria-busy={pending || undefined}
      className="flex min-w-0 flex-1 flex-col gap-1"
      onSubmit={onSubmit}
      onBlur={onBlur}
    >
      <div className="flex min-w-0 items-center gap-1">
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          value={name}
          dir="auto"
          maxLength={255}
          autoComplete="off"
          readOnly={pending}
          aria-invalid={error != null || undefined}
          aria-describedby={error != null ? errorId : undefined}
          className={cn(
            "h-7 min-w-0 flex-1 rounded-md border border-dimah-s3-border bg-transparent px-2 text-sm text-dimah-s3-foreground outline-none focus-visible:border-dimah-s3-ring focus-visible:ring-3 focus-visible:ring-dimah-s3-ring/50 aria-invalid:border-dimah-s3-destructive aria-invalid:ring-dimah-s3-destructive/20",
          )}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || lock.current) return;
            event.preventDefault();
            finish(true);
          }}
        />
        {confirm}
        {cancel}
      </div>
      {error != null ? (
        <p
          id={errorId}
          role="alert"
          className="text-xs [overflow-wrap:anywhere] text-dimah-s3-destructive"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
