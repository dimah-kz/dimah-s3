---
packages:
  "@dimah-s3/ui":
    replay:
      - exit-prerelease(npm:@dimah-s3/ui)
---

### Toaster, toast, and Attachment parts with props of their own

The npm exports that render shadcn primitives take props `@dimah-s3/ui` defines, so a primitive update cannot change them.

- **`Toaster`.** Takes `limit` (default `3`), `timeout` (default `5000` ms, `0` keeps toasts open), and optional `children`. `ToasterProps` is its type.
- **`toast`.** `toast.add(options)` returns an id, `toast.update(id, options)` changes an open toast, and `toast.close(id?)` closes one or every toast. `ToastOptions` holds `title`, `description`, `type` (`ToastType`), `timeout`, `priority`, `action`, and `onClose`.
- **`AttachmentGroup`, `AttachmentAction`, and `AttachmentTrigger`.** Their props are `AttachmentGroupProps` (a `<div>`), `AttachmentActionProps` (a `<button>` plus `focusableWhenDisabled`), and `AttachmentTriggerProps` (a `<button>`, or the element `render` returns).
- **`AttachmentState`.** The union `"idle" | "uploading" | "processing" | "error" | "done"`, no longer read from the shadcn Attachment.
- **`useToastOwner` for your own toasts.** Call it in a toast component built on another library, and show toasts only while it returns `true`: the `ObjectList` built-in toasts step aside. `UseToastOwnerOptions` is the type of its `{ weak }` options.

#### Breaking changes

- **Pass `action: { label, onClick }` to `toast.add`.** `actionProps` is replaced. `toast.promise`, `toast.subscribe`, and `data` are removed; show a loading toast with `type: "loading"` and `timeout: 0`, then `toast.update` it.
- **Drop `toastManager` from `<Toaster>`.** It takes only `limit`, `timeout`, and `children`.
- **Style `AttachmentAction` with `className`.** It no longer takes the Button `variant` and `size` props.
