// FumaDB client
export {
  DimahS3Share,
  SHARE_SCHEMA_VERSION,
  type DimahS3ShareClient,
} from "./fuma-db";
export { migrate } from "./migrate";

// Plugin
export {
  share,
  type PruneLinksOptions,
  type SharePluginContext,
} from "./plugin/share";
export type { ShareEndpoints } from "./plugin/endpoints";
export type { ShareLinks } from "./plugin/public-links";
export type { ShareServerApi } from "./plugin/server-api";
export type {
  ShareAuthorizeContext,
  ShareCall,
  ShareDownloadedContext,
  ShareExpirationOptions,
  ShareHook,
  ShareLinkEventContext,
  ShareLinkSettings,
  ShareLinkUpdatedContext,
  ShareOpenedContext,
  ShareOptions,
  ShareOwnerCall,
  SharePasswordOptions,
  ShareResolvedTarget,
} from "./types/options";

// Links
export {
  shareLinkStatus,
  type ShareLink,
  type ShareLinkStatus,
  type ShareLinkTarget,
} from "./types/link";
export type {
  LinkFilter,
  ListLinksInput,
  ListLinksPage,
} from "./store/link-store";

// Shared with the client
export { SHARE_ERROR_CODES } from "./error-codes";
export {
  isSharePublicAction,
  SHARE_LIST_MAX_LIMIT,
  SHARE_MAX_DOWNLOADS_LIMIT,
  SHARE_OWNER_ACTIONS,
  SHARE_PUBLIC_ACTIONS,
  type ShareOwnerAction,
  type SharePublicAction,
} from "./constants";
export type * from "./types/client";
