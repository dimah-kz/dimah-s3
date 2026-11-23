"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
} from "react";
import {
  useFormatError,
  type ObjectListEntry,
  type UseObjectListReturn,
} from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { CheckIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { splitFileName } from "@/components/dimah-s3/attachment/file-name";
import {
  useObjectListContext,
  useObjectListInternal,
} from "@/components/dimah-s3/list/object-list-context";

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
 *
 * Save and Cancel sit inside the field, at its end. `layout` is set as
 * `data-layout` (`inline` in a row, `stacked` in a tile) for styling.
 */
export function ObjectListRenameField<TItem>({
  entry,
  layout = "inline",
}: {
  entry: ObjectListEntry<TItem>;
  layout?: "inline" | "stacked";
}) {
  const t = useTranslations();
  const formatError = useFormatError();
  const { list } = useObjectListContext<TItem>();
  const { endRename } = useObjectListInternal();
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
    ? t("Folder name", { note: "object list rename" })
    : t("File name", { note: "object list rename" });

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const end = folder
      ? entry.name.length
      : splitFileName(entry.name).stem.length;
    input.setSelectionRange(0, end);
  }, [entry.name, folder]);

  function finish(focus: boolean) {
    if (closed.current) return;
    closed.current = true;
    endRename(entry.key, focus);
  }

  async function save(focus: boolean) {
    if (closed.current || lock.current) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError(
        folder
          ? t("Enter a folder name", { note: "object list rename" })
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
      // Only a submit keeps focus here: a save on blur lets focus leave.
      if (focus) inputRef.current?.focus();
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

  // Inside the field, a little larger on touch screens.
  const buttonClass = "shrink-0 pointer-coarse:size-7";
  const confirm = (
    <Button
      type="submit"
      variant="default"
      size="icon-xs"
      className={buttonClass}
      aria-label={t("Save name", { note: "object list rename" })}
      aria-busy={pending || undefined}
      disabled={pending}
      focusableWhenDisabled
      onMouseDown={(event) => event.preventDefault()}
    >
      {pending ? (
        <Spinner aria-hidden aria-label={undefined} role={undefined} />
      ) : (
        <CheckIcon />
      )}
    </Button>
  );
  const cancel = (
    <Button
      type="button"
      variant="destructive"
      size="icon-xs"
      className={buttonClass}
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
      data-layout={layout}
      aria-busy={pending || undefined}
      className="flex min-w-0 flex-1 flex-col gap-1"
      onSubmit={onSubmit}
      onBlur={onBlur}
    >
      <div className="relative flex min-w-0 items-center">
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          value={name}
          maxLength={255}
          autoComplete="off"
          readOnly={pending}
          aria-invalid={error != null || undefined}
          aria-describedby={error != null ? errorId : undefined}
          className={cn(
            // 16px text on small screens, which iOS does not zoom into.
            "h-8 w-full min-w-0 rounded-md border border-dimah-s3-border bg-transparent ps-2 pe-15 text-base text-dimah-s3-foreground outline-none focus-visible:border-dimah-s3-ring focus-visible:ring-3 focus-visible:ring-dimah-s3-ring/50 aria-invalid:border-dimah-s3-destructive aria-invalid:ring-dimah-s3-destructive/20 md:text-sm pointer-coarse:h-9 pointer-coarse:pe-17",
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
        <div className="absolute inset-y-0 end-1 flex items-center gap-0.5">
          {confirm}
          {cancel}
        </div>
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
