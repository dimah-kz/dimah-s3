"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fileNameFromKey } from "@dimah-s3/core";
import type { ObjectListFolder } from "@dimah-s3/react";

type SelectionRow = { kind: "file" | "folder"; id: string };

/**
 * Checkbox selection for the rows loaded so far.
 * The list remounts this state when `list.parent` changes.
 */
export function useObjectListSelection<TItem>({
  items,
  folders,
  filesSelectable,
  foldersSelectable,
  getKey,
  getLabel,
  getFileName,
  getObjectKey,
  resolveFolderKeys,
  onSelectionChange,
}: {
  items: readonly TItem[];
  folders: readonly ObjectListFolder[];
  filesSelectable: boolean;
  foldersSelectable: boolean;
  getKey: (item: TItem) => string;
  getLabel: (item: TItem) => string;
  getFileName?: (item: TItem) => string;
  getObjectKey?: (item: TItem) => string;
  resolveFolderKeys?: (folder: ObjectListFolder) => Promise<readonly string[]>;
  onSelectionChange?: (selection: {
    items: readonly TItem[];
    folders: readonly ObjectListFolder[];
  }) => void;
}) {
  const [fileKeys, setFileKeys] = useState<ReadonlySet<string>>(new Set());
  const [folderIds, setFolderIds] = useState<ReadonlySet<string>>(new Set());
  const anchorRef = useRef<number | null>(null);
  const visibleFileKeys = useMemo(
    () => (filesSelectable ? items.map((item) => getKey(item)) : []),
    [filesSelectable, getKey, items],
  );
  const visibleFolderIds = useMemo(
    () => (foldersSelectable ? folders.map((folder) => folder.id) : []),
    [folders, foldersSelectable],
  );
  const selectedFileKeys = visibleFileKeys.filter((key) => fileKeys.has(key));
  const selectedFolderIds = visibleFolderIds.filter((id) => folderIds.has(id));
  const selectedFileKeySig = JSON.stringify(selectedFileKeys);
  const selectedFolderIdSig = JSON.stringify(selectedFolderIds);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const getKeyRef = useRef(getKey);
  const rowsSelectable = filesSelectable || foldersSelectable;
  const selectedCount = selectedFileKeys.length + selectedFolderIds.length;
  const visibleCount = visibleFileKeys.length + visibleFolderIds.length;
  const selecting = rowsSelectable && selectedCount > 0;
  const snapshotRef = useRef({
    selecting: false,
    fileIds: [] as readonly string[],
    folderIds: [] as readonly string[],
  });

  useEffect(() => {
    snapshotRef.current = {
      selecting,
      fileIds: visibleFileKeys,
      folderIds: visibleFolderIds,
    };
  }, [selecting, visibleFileKeys, visibleFolderIds]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
    getKeyRef.current = getKey;
  }, [getKey, onSelectionChange]);

  useEffect(() => {
    const notify = onSelectionChangeRef.current;
    if (!notify) return;
    const fileSet = new Set<string>(JSON.parse(selectedFileKeySig) as string[]);
    const folderSet = new Set<string>(
      JSON.parse(selectedFolderIdSig) as string[],
    );
    notify({
      items: items.filter((item) => fileSet.has(getKeyRef.current(item))),
      folders: folders.filter((folder) => folderSet.has(folder.id)),
    });
  }, [folders, items, selectedFileKeySig, selectedFolderIdSig]);

  const selectionRows: SelectionRow[] = [];
  if (foldersSelectable) {
    for (const folder of folders) {
      selectionRows.push({ kind: "folder", id: folder.id });
    }
  }
  if (filesSelectable) {
    for (const item of items) {
      selectionRows.push({ kind: "file", id: getKey(item) });
    }
  }

  function toggleAll(checked: boolean) {
    anchorRef.current = null;
    setFileKeys(checked ? new Set(visibleFileKeys) : new Set());
    setFolderIds(checked ? new Set(visibleFolderIds) : new Set());
  }

  function clearSelection() {
    anchorRef.current = null;
    setFileKeys(new Set());
    setFolderIds(new Set());
  }

  function selectAt(index: number, checked: boolean, shift: boolean) {
    const row = selectionRows[index];
    if (!row) return;
    if (shift && anchorRef.current != null) {
      const start = Math.min(anchorRef.current, index);
      const end = Math.max(anchorRef.current, index);
      const files = new Set(fileKeys);
      const nextFolders = new Set(folderIds);
      for (let cursor = start; cursor <= end; cursor++) {
        const entry = selectionRows[cursor];
        if (!entry) continue;
        if (entry.kind === "file") files.add(entry.id);
        else nextFolders.add(entry.id);
      }
      setFileKeys(files);
      setFolderIds(nextFolders);
      return;
    }
    if (row.kind === "file") {
      setFileKeys((current) => replaceMember(current, row.id, checked));
    } else {
      setFolderIds((current) => replaceMember(current, row.id, checked));
    }
    anchorRef.current = index;
  }

  function selectRow(
    kind: "file" | "folder",
    id: string,
    checked: boolean,
    shift: boolean,
  ) {
    selectAt(
      selectionRows.findIndex((row) => row.kind === kind && row.id === id),
      checked,
      shift,
    );
  }

  useEffect(() => {
    if (!rowsSelectable) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (isFieldTarget(event.target) || isOverlayTarget(event.target)) return;
      const snapshot = snapshotRef.current;

      if (event.key === "Escape") {
        if (!snapshot.selecting) return;
        event.preventDefault();
        anchorRef.current = null;
        setFileKeys(new Set());
        setFolderIds(new Set());
        return;
      }

      if (event.code !== "KeyA") return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
        return;
      }
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest("[data-slot=object-list]")) return;
      if (snapshot.fileIds.length + snapshot.folderIds.length === 0) return;
      event.preventDefault();
      anchorRef.current = null;
      setFileKeys(new Set(snapshot.fileIds));
      setFolderIds(new Set(snapshot.folderIds));
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [rowsSelectable]);

  async function prepareSelection() {
    const entries: { key: string; fileName?: string }[] = [];
    const seen = new Set<string>();
    function add(key: string, fileName?: string) {
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({ key, fileName });
    }
    const objectKeyOf = getObjectKey ?? getKey;
    for (const item of items) {
      if (!fileKeys.has(getKey(item))) continue;
      add(objectKeyOf(item), getFileName?.(item) ?? getLabel(item));
    }
    let skippedFolders = 0;
    for (const folder of folders) {
      if (!folderIds.has(folder.id)) continue;
      if (!resolveFolderKeys) {
        skippedFolders += 1;
        continue;
      }
      for (const key of await resolveFolderKeys(folder)) {
        add(key, fileNameFromKey(key));
      }
    }
    return { entries, skippedFolders };
  }

  return {
    fileKeys,
    folderIds,
    selectedCount,
    allSelected: visibleCount > 0 && selectedCount === visibleCount,
    selecting,
    rowsSelectable,
    toggleAll,
    clearSelection,
    selectRow,
    prepareSelection,
  };
}

function isFieldTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

function isOverlayTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "[role=dialog], [role=alertdialog], [role=menu], [data-slot=dropdown-menu-content], [data-slot=alert-dialog-content]",
      ),
    )
  );
}

function replaceMember(
  current: ReadonlySet<string>,
  id: string,
  checked: boolean,
) {
  const next = new Set(current);
  if (checked) next.add(id);
  else next.delete(id);
  return next;
}
