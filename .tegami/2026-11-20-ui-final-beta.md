---
packages:
  "@dimah-s3/ui": major
---

### Entry menu, a smaller list context, and named icon buttons

`ObjectList` calls its row menu `ObjectListEntryMenu` and shares a smaller, documented context with parts of your own. Icon-size triggers keep an accessible name, Copy link works in Safari, and registry items install the 2.x packages.

- **Registry items install 2.x.** Every item pins `@dimah-s3/core` and `@dimah-s3/react` to the 2.x line, so `shadcn add` never installs another major next to the copied source. The items need a shadcn project on a Base UI style; the npm package bundles its primitives and works anywhere.
- **`ObjectListEntryMenuItem`.** A row for the `children` of `ObjectListEntryMenu`, with `onClick`, `disabled`, and `destructive`. Use it for a row that `actions` cannot describe.
- **Entry menu names.** The menu button of a row is named after its entry, "Actions for report.pdf", in place of "File actions" and "Folder actions". Tests that find the button by name need the new one.
- **Copy link in Safari.** The clipboard write starts inside the click, through a `ClipboardItem` that resolves once the URL is signed. Browsers without `ClipboardItem` keep `writeText`.
- **Icon-size triggers keep a name.** `UploadTrigger`, `DownloadTrigger`, and `DeleteTrigger` at an icon `size` render their default label visually hidden, so the button has an accessible name without an `aria-label`. `UploadTrigger` now shows the icon alone at an icon `size`.
- **`AvatarUpload` announces once.** Its live region stays silent while an `UploadToasts` is mounted for the same hook, which reads the same messages out.
- **Translated accessible names.** The breadcrumb navigation is named "Folder path" through the translations. The spinner inside a busy New folder, Rename, Load more, or bulk Delete button is hidden from assistive technology, so the button keeps its own name.
- **`onDismissed` on a delete request.** `request(targets, { onDismissed })` from `useDeleteContext()` runs when the confirm dialog closes without deleting, or another request replaces it. The bulk Delete button of `ObjectList` is no longer busy for keys whose dialog was dismissed.
- **`ObjectListRow` and `ObjectListTile` provide their entry.** The default menu works on a row that `renderEntry` returns.
- **Prop types.** Every exported component has an exported `*Props` type: `ObjectListBreadcrumbProps`, `ObjectListBulkDeleteProps`, `ObjectListCheckboxProps`, `ObjectListContentProps`, `ObjectListSelectAllProps`, `ObjectListSortMenuProps`, `ObjectListUploadStatusProps`, `ObjectListUsageProps`, and `ObjectListViewToggleProps` are new. `ObjectListBulkDelete` and `DismissAttachmentAction` take a `className`.
- **Declarations without `react-file-icon`.** The published types no longer import `react-file-icon`, which ships none, so `skipLibCheck: false` passes.
- **`useToastOwner` without a bundler.** It no longer reads `process` where there is none.

#### Breaking changes

- **Rename `ObjectListItemMenu` to `ObjectListEntryMenu`.**
  - `ObjectListItemMenuProps` → `ObjectListEntryMenuProps`.
  - `ObjectListMenuAction` → `ObjectListEntryMenuAction`.
  - `data-slot="object-list-item-menu"` → `data-slot="object-list-entry-menu"`.
  - The registry file `list/object-list-item-menu.tsx` → `list/object-list-entry-menu.tsx`.
  - Pass `ObjectListEntryMenuItem` children in place of your own `DropdownMenuItem`.
- **Read less from `useObjectListContext()`.** It returns `list`, `selection`, `upload`, `download`, `share`, `delete`, `toasts`, `announce`, `view`, `setView`, `rootLabel`, `startNewFolder`, `startRename`, and `revealEntry`.
  - `label` → `rootLabel`.
  - `setNewFolderOpen(true)` → `startNewFolder()`. `newFolderOpen` is removed; the field closes itself.
  - `sizing`, `showBreadcrumb`, `selectionActions`, `empty`, `pagination`, `onOpenItem`, `resolveFolderKeys`, `renamingKey`, `endRename`, and the four `render*` functions are removed from the context. Read them from the props you pass to `ObjectList`.
- **Rename the type `ObjectListPagination` to `ObjectListPaginationMode`.**
- **Rename `AvatarUpload` `onChange` to `onUploaded`.** It still runs once per uploaded image with the `UploadResult`.
- **Rename `ObjectListSearch` `delay` to `debounceMs`.**
- **Remove your `--dimah-s3-accent` and `--dimah-s3-primary-foreground` overrides.** No component read these tokens. The `*-dimah-s3-accent` and `*-dimah-s3-primary-foreground` utilities are removed with them.
- **Give `CircleProgress` a `fileName` or a `label`.** The type requires one of them, since they name the progress bar.
- **Drop `onRetry` and `retryDisabled` from `ObjectCard`, and `children` from `DownloadProgress`.** They never had an effect, and the types no longer accept them.
- **Update these translation keys.** A key is its English text and note, so a changed note is a new key.
  - `"You can upload {count} files(dropzone hint)"`, `"Each up to {size}(dropzone hint)"`, and `"Up to {size}(dropzone hint)"` end with a period: `"You can upload {count} files.(dropzone hint)"`, `"Each up to {size}.(dropzone hint)"`, `"Up to {size}.(dropzone hint)"`. The hint joins whole sentences with a space.
  - `", (list separator)"` is new. It separates the accepted types in `"Accepted {types}.(dropzone hint)"`.
  - `"Upload failed(status)"` → `"Upload failed(upload status)"`, and `"All {count} files uploaded(status)"` → `"All {count} files uploaded(upload status)"`.
  - `"Upload progress(progress)"` → `"Upload progress(upload progress)"`.
  - `"Failed(status)"` → `"Failed(attachment status)"`.
  - `"This link works while you can access this file."` and the eight `"Expires in …"` keys move from the note `object list menu` to `share link`.
  - The rename field uses `"Folder name(object list rename)"`, `"Enter a folder name(object list rename)"`, and `"Save name(object list rename)"` for its submit button, in place of the new-folder and menu keys.
  - `"Actions for {name}(object list menu)"` and `"Folder path(object list)"` are new.
