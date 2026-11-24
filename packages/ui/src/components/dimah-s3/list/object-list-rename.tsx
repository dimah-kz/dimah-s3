"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
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
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
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
 * `inline` (a row) puts only Cancel inside the field: Enter or leaving the
 * field saves. `stacked` (a tile, where the field is narrow) puts Cancel and
 * Save under the field, sharing its width.
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

  const stacked = layout === "stacked";
  const spinner = (
    <Spinner aria-hidden aria-label={undefined} role={undefined} />
  );
  const confirm = (
    <Button
      type="submit"
      variant="default"
      size="sm"
      className="w-full pointer-coarse:h-9"
      aria-label={t("Save name", { note: "object list rename" })}
      aria-busy={pending || undefined}
      disabled={pending}
      focusableWhenDisabled
      onMouseDown={(event) => event.preventDefault()}
    >
      {pending ? spinner : <CheckIcon />}
    </Button>
  );
  const cancel = (
    <Button
      type="button"
      variant="destructive"
      size={stacked ? "sm" : "icon-xs"}
      className={
        stacked ? "w-full pointer-coarse:h-9" : "shrink-0 pointer-coarse:size-7"
      }
      aria-label={t("Cancel", { note: "object list rename" })}
      // In a row, Cancel is the only button, so it shows the save in flight.
      aria-busy={(!stacked && pending) || undefined}
      disabled={pending}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => finish(true)}
    >
      {!stacked && pending ? spinner : <XIcon />}
    </Button>
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(true);
  }

  // The same field in either layout, in the text size of the name it replaces.
  const inputProps = {
    ref: inputRef,
    id: inputId,
    value: name,
    maxLength: 255,
    autoComplete: "off",
    readOnly: pending,
    "aria-invalid": error != null || undefined,
    "aria-describedby": error != null ? errorId : undefined,
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      setName(event.target.value);
      setError(null);
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Escape" || lock.current) return;
      event.preventDefault();
      finish(true);
    },
  };

  return (
    <form
      data-slot="object-list-rename"
      data-layout={layout}
      aria-busy={pending || undefined}
      className={cn(
        "flex min-w-0 flex-1 flex-col",
        stacked ? "gap-1.5" : "gap-1",
      )}
      onSubmit={onSubmit}
      onBlur={onBlur}
    >
      <div className="flex min-w-0 items-center">
        <Label htmlFor={inputId} className="sr-only">
          {label}
        </Label>
        {stacked ? (
          <Input
            {...inputProps}
            className="h-8 border-dimah-s3-border px-2 text-sm pointer-coarse:h-9"
          />
        ) : (
          <InputGroup className="h-8 border-dimah-s3-border pointer-coarse:h-9">
            <InputGroupInput {...inputProps} className="ps-2 text-sm" />
            <InputGroupAddon align="inline-end">{cancel}</InputGroupAddon>
          </InputGroup>
        )}
      </div>
      {stacked ? (
        <div className="grid grid-cols-2 gap-1.5">
          {cancel}
          {confirm}
        </div>
      ) : null}
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
