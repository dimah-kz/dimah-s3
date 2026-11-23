"use client";

import { useCallback } from "react";
import {
  useFormatError,
  useFormatNumber,
  type DeleteResult,
  type ObjectListEntry,
  type ObjectListFolderEntry,
} from "@dimah-s3/react";
import { objectKeyOf } from "@dimah-s3/react/engine";
import { useTranslations } from "@fuma-translate/react";
import {
  useOptionalDeleteContext,
  type DeleteTarget,
} from "@/components/dimah-s3/delete/delete";
import {
  useObjectListContext,
  useObjectListInternal,
} from "@/components/dimah-s3/list/object-list-context";
import { useObjectListFeedback } from "@/components/dimah-s3/list/object-list-feedback";
import { isolateText } from "@/lib/isolate-text";

/** Options for the function {@link useObjectListDeleteRequest} returns. */
export type ObjectListDeleteRequestOptions = {
  /** Where focus returns when the dialog closes. Defaults to the focused element. */
  trigger?: HTMLElement | null;
  /** Runs once the delete settles, with every key's outcome. */
  onDeleted?: (result: DeleteResult) => void;
  /** Runs when the dialog closes without deleting. */
  onDismissed?: () => void;
};

/**
 * Asks the list's delete root to delete entries, with one confirmation.
 *
 * Files go as they are. A folder goes with everything in it: once the
 * dialog is confirmed, the source's `listFolderKeys` names its files, the
 * list's `delete` removes them, and `deleteFolder` removes the emptied
 * folder. A folder whose files did not all go stays. Folders stay out
 * when the source cannot delete them, and the dialog says so.
 *
 * `null` without a `delete` on the list. The function returns `false` when
 * there was nothing to delete. @internal
 */
export function useObjectListDeleteRequest<TItem>():
  | ((
      entries: readonly ObjectListEntry<TItem>[],
      options?: ObjectListDeleteRequestOptions,
    ) => boolean)
  | null {
  const t = useTranslations();
  const formatError = useFormatError();
  const formatNumber = useFormatNumber();
  const report = useObjectListFeedback();
  const { list, selection } = useObjectListContext<TItem>();
  const { prepareDeleteFocus } = useObjectListInternal();
  const root = useOptionalDeleteContext();
  const request = root?.request;

  const requestDelete = useCallback(
    (
      entries: readonly ObjectListEntry<TItem>[],
      options: ObjectListDeleteRequestOptions = {},
    ): boolean => {
      if (!request) return false;
      const files = entries.filter((entry) => entry.kind === "file");
      const folders = entries.filter(
        (entry): entry is ObjectListFolderEntry => entry.kind === "folder",
      );
      const removable = list.deleteFolder ? folders : [];
      const note =
        removable.length < folders.length
          ? t("Selected folders stay in the list.", {
              note: "object list selection",
            })
          : undefined;
      const fileTargets: DeleteTarget[] = files.map((entry) => ({
        objectKey: objectKeyOf(entry),
        fileName: entry.file.name,
        fileSize: entry.file.size,
      }));
      if (fileTargets.length === 0 && removable.length === 0) {
        report({
          type: "info",
          title:
            note ?? t("Nothing to delete", { note: "object list selection" }),
        });
        return false;
      }
      const { trigger, onDeleted, onDismissed } = options;
      if (removable.length === 0) {
        request(fileTargets, { note, trigger, onDeleted, onDismissed });
        return true;
      }

      const lone = files.length === 0 && removable.length === 1;
      const count = files.length + removable.length;
      const deleteFolder = list.deleteFolder;
      const listFolderKeys = list.listFolderKeys;
      const removedKeys = [...files, ...removable].map((entry) => entry.key);

      async function run(
        remove: (targets: readonly DeleteTarget[]) => Promise<DeleteResult>,
      ): Promise<DeleteResult> {
        prepareDeleteFocus(removedKeys);
        const failures: { name: string; error: unknown }[] = [];
        // Each folder's files, named once the dialog is confirmed.
        const listed = await Promise.all(
          removable.map(async (entry) => {
            if (!listFolderKeys || entry.folder.objectCount === 0) {
              return { entry, keys: [] as readonly string[] };
            }
            try {
              return { entry, keys: await listFolderKeys(entry.folder) };
            } catch (error) {
              failures.push({ name: entry.name, error });
              return null;
            }
          }),
        );
        const targets = new Map(
          fileTargets.map((target) => [target.objectKey, target]),
        );
        for (const folder of listed) {
          for (const objectKey of folder?.keys ?? []) {
            if (!targets.has(objectKey)) targets.set(objectKey, { objectKey });
          }
        }
        const result = await remove([...targets.values()]);
        const deleted = new Set(result.deleted);
        const gone: ObjectListFolderEntry[] = [];
        // A folder whose files did not all go stays, and the delete
        // toast names the files.
        for (const folder of listed) {
          if (!folder || !deleteFolder) continue;
          if (!folder.keys.every((key) => deleted.has(key))) continue;
          try {
            await deleteFolder(folder.entry.folder);
            gone.push(folder.entry);
          } catch (error) {
            failures.push({ name: folder.entry.name, error });
          }
        }
        if (gone.length > 0) {
          selection?.deselect(gone.map((entry) => entry.key));
          // Deleted files have their own toast.
          if (result.deleted.length === 0) {
            report({
              type: "success",
              title:
                gone.length === 1
                  ? t("Folder deleted", { note: "toast" })
                  : t("Deleted {count} folders", {
                      note: "toast",
                      variables: { count: formatNumber(gone.length) },
                    }),
            });
          }
        }
        const [failure] = failures;
        if (failure) {
          report({
            type: "error",
            title:
              failures.length === 1
                ? t('Could not delete "{name}"', {
                    note: "toast",
                    variables: { name: isolateText(failure.name) },
                  })
                : t("Could not delete {count} folders", {
                    note: "toast",
                    variables: { count: formatNumber(failures.length) },
                  }),
            description: (
              <span className="block [overflow-wrap:anywhere]">
                {formatError(failure.error)}
              </span>
            ),
          });
        }
        return result;
      }

      request(fileTargets, {
        title: lone
          ? t("Delete folder?", { note: "dialog title" })
          : t("Delete {count} items?", {
              note: "dialog title",
              variables: { count: formatNumber(count) },
            }),
        description: lone
          ? t(
              'Are you sure you want to delete "{name}" and everything in it? This action cannot be undone.',
              {
                note: "dialog description",
                variables: { name: isolateText(removable[0]?.name ?? "") },
              },
            )
          : t(
              "Folders are deleted with everything in them. This action cannot be undone.",
              { note: "dialog description" },
            ),
        note,
        trigger,
        run,
        onDeleted,
        onDismissed,
      });
      return true;
    },
    [
      formatError,
      formatNumber,
      list.deleteFolder,
      list.listFolderKeys,
      prepareDeleteFocus,
      report,
      request,
      selection,
      t,
    ],
  );
  return request ? requestDelete : null;
}
