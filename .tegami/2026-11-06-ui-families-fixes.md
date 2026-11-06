---
packages:
  "@dimah-s3/ui":
    replay:
      - exit-prerelease(npm:@dimah-s3/ui)
---

### Sturdier list, delete, and upload components

The families fix their focus, state, and labelling edge cases, and a few names now match their siblings.

- **`FileTypeGlyph`** labels a file with its own type: `song.flac` reads `flac` and `scan.tiff` reads `tiff`, where they read `mp3` and `png`. The styles come straight from `react-file-icon`.
- **Deletes show at once.** `DeleteTrigger`, `ObjectCard`, and the file menu show a delete as running from the moment its key is claimed, also while `beforeDelete` runs. `DeleteTrigger` sets `data-phase`.
- **`Delete` leaves no rejection unhandled.** A throw from `onDeleted` goes to `reportError`, and the dialog still closes. `confirm()` never rejects.
- **Per-request `onDeleted`.** `request(targets, { onDeleted })` runs after the root's `onDeleted`, once that request's delete settles.
- **Icon-size triggers.** `DownloadTrigger` and `DeleteTrigger` with an `icon*` size show the icon alone, and the spinner while they run. `ObjectCard` uses them, so its actions show the busy state.
- **Upload.**
  - `UploadField` queues its calls, so a new pick never cancels the files still uploading into the value.
  - Inside a field, `UploadStatus` shows the one file left as its own card.
  - `AvatarUpload` drops the upload's preview once `objectKey` moves to another image, such as when the photo is removed.
  - Focus that leaves a removed card skips elements that cannot take it.
- **`ObjectImage`** signs a URL that fails to load again once, as for one that expired while the tab slept, before it shows `fallback`. Its `ref` reaches the `<img>`, and the `ref` of `DownloadProgress` reaches its progressbar.
- **`ObjectList`.**
  - A rename whose save lands after another rename started leaves the newer field open, and a save that fails on blur no longer pulls focus back.
  - A file row that neither opens nor selects still takes the arrow keys, F2, and focus after a rename or delete.
  - With a `persist` selection, the selection bar sits under the path instead of replacing it, so you can change folders while you pick.
  - A bulk delete resolves the selected folders at once, and a folder it empties leaves the selection.
  - Ctrl+A or Cmd+A follows the keyboard layout.
- **Toasts** name the file when an upload, download, or delete fails, and the upload progress toast reads "{loaded} of {total}" in your language.

#### Breaking changes

- **`useDeleteContext()`.** `pending` is now `confirmation`, and `cancel` is now `dismiss`. The new `isDeleting` is `true` while the confirmed delete runs, so a custom dialog no longer tracks its own busy state. The `DeleteConfirmation` type names the request.
- **Rename `NewFolderControl` to `ObjectListNewFolder`**, and `NewFolderControlProps` to `ObjectListNewFolderProps`.
- **`ObjectList` `loadMore` is now `pagination`** (`"auto"` or `"button"`), so it no longer shares a name with `list.loadMore()`. The context field is renamed too, and `ObjectListPagination` names its type.
- **`ObjectListContextValue.cancelRename(focus?)` is now `endRename(key, focus?)`.** It closes the field only while `key` is the entry being renamed.
- **`FileAttachment`.** An error card without `error` or `description` reads "Failed" instead of "Upload failed".
- **Translations.** `"{loaded} of {total}"` now has the note `transfer progress` (it was `download progress`). `"Failed"` (note `status`) is new.
