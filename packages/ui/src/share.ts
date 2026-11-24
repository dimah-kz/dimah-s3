/*
 * `@dimah-s3/ui/share`: the share link components. A separate entry, so the
 * main one never imports `@dimah-s3/share`, an optional peer. They take the
 * hooks of `@dimah-s3/share/react`: `useShareLinks` and `useShareVisit`.
 */
export {
  ShareLinkDialog,
  shareTargetOf,
  type ShareLinkDialogProps,
} from "@/components/dimah-s3/share/share-link-dialog";
export {
  DEFAULT_SHARE_EXPIRY_OPTIONS,
  type ShareLinkFieldsOptions,
} from "@/components/dimah-s3/share/share-link-fields";
export {
  SharedView,
  type SharedViewProps,
} from "@/components/dimah-s3/share/shared-view";
