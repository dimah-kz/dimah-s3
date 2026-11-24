import { SHARE_LIST_MAX_LIMIT } from "@/constants";
import type {
  ShareAccess,
  ShareClientActions,
  ShareDownloadResponse,
  ShareListSharedInput,
  ShareListSort,
  ShareListSortField,
  ShareVisitorFolder,
  ShareVisitorObject,
} from "@/types/client";

/** A folder row of {@link ShareObjectSource}. Mirrors react's `ObjectListFolder`. */
export type ShareObjectSourceFolder = {
  id: string;
  name: string;
  /** Folders from the top of the share down to the one that holds it. Set on search results. */
  location?: readonly ShareObjectSourceFolder[];
};

/** How the list reads one shared file. Mirrors react's `ObjectListFile`. */
export type ShareObjectSourceFile = {
  name: string;
  /** The opaque file id, which `downloadShared` takes. Never the object key. */
  objectKey: string;
  size: number | null;
  contentType: string | null;
  updatedAt: string;
  /** Folders from the top of the share down to the file's folder. Set on search results. */
  location?: readonly ShareObjectSourceFolder[];
};

/** The `useObjectList` query input. Mirrors react's `ObjectListQueryInput`. */
export type ShareObjectSourceQueryInput = {
  /** Folder id. `null` is the top of the share. */
  parent: string | null;
  cursor: string | null;
  /** `name`, `size`, `updatedAt`, or `createdAt`. Other fields keep the default order. */
  sort: { field: string; direction: "asc" | "desc" } | null;
  search: string;
  signal: AbortSignal;
};

/** One page of {@link ShareObjectSource}. Mirrors react's `ObjectListPage`. */
export type ShareObjectSourcePage = {
  items: ShareVisitorObject[];
  folders?: ShareObjectSourceFolder[];
  trail?: ShareObjectSourceFolder[];
  nextCursor: string | null;
  total?: number;
};

/**
 * A read-only `useObjectList` source over a share link. Typed structurally
 * so share does not depend on react; a type test checks it against
 * `ObjectListSource`.
 */
export type ShareObjectSource = {
  query: (input: ShareObjectSourceQueryInput) => Promise<ShareObjectSourcePage>;
  getId: (item: ShareVisitorObject) => string;
  getFile: (item: ShareVisitorObject) => ShareObjectSourceFile;
};

/** Options of {@link shareObjectSource}. */
export type ShareObjectSourceOptions = {
  /** The link token, from the shared URL. */
  token: string;
  /** From `unlockLink`, for a password-protected link. */
  access?: ShareAccess;
  /** Rows per page, 1 to 100. A value outside that is clamped to it. */
  limit?: number;
};

const SORT_FIELDS: ReadonlySet<string> = new Set<ShareListSortField>([
  "name",
  "size",
  "updatedAt",
  "createdAt",
]);

function toSort(
  sort: ShareObjectSourceQueryInput["sort"],
): ShareListSort | undefined {
  if (!sort || !SORT_FIELDS.has(sort.field)) return undefined;
  return { field: sort.field as ShareListSortField, direction: sort.direction };
}

function pageLimit(limit: number): number {
  const rows = Math.floor(limit);
  if (Number.isNaN(rows)) return SHARE_LIST_MAX_LIMIT;
  return Math.min(Math.max(rows, 1), SHARE_LIST_MAX_LIMIT);
}

/** The path to each folder, from the top of the share, by walking `parentId`. */
function locationsOf(
  folders: readonly ShareVisitorFolder[],
): (folderId: string | null) => ShareObjectSourceFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  return (folderId) => {
    const chain: ShareObjectSourceFolder[] = [];
    const seen = new Set<string>();
    let current = folderId === null ? undefined : byId.get(folderId);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      chain.unshift({ id: current.id, name: current.name });
      current =
        current.parentId === null ? undefined : byId.get(current.parentId);
    }
    return chain;
  };
}

/**
 * A read-only `useObjectList` source over `api.share.listShared`, for the
 * page a visitor opens. Each page lists one folder of the share, with its
 * child folders and the breadcrumb from the top of the share. A search
 * reaches every folder below the open one, and each result says where it
 * lives. An object link lists its one file.
 *
 * Downloads go through `api.share.downloadShared` with the file `id`, not
 * through a route: see {@link downloadSharedFile}.
 *
 * ```ts
 * const list = useObjectList({
 *   ...shareObjectSource(s3Client.share, { token, access }),
 *   queryKey: ["share", token, access],
 * });
 * ```
 */
export function shareObjectSource(
  share: Pick<ShareClientActions, "listShared">,
  options: ShareObjectSourceOptions,
): ShareObjectSource {
  // Where each row of a search lives, keyed by the row object so `getFile`
  // stays pure.
  const locations = new WeakMap<object, ShareObjectSourceFolder[]>();
  return {
    getId: (item) => item.id,
    getFile: (item) => {
      const file: ShareObjectSourceFile = {
        name: item.name,
        objectKey: item.id,
        size: item.size,
        contentType: item.contentType,
        updatedAt: item.updatedAt,
      };
      const location = locations.get(item);
      if (location) file.location = location;
      return file;
    },
    async query({ parent, cursor, sort, search, signal }) {
      const input: ShareListSharedInput = {
        token: options.token,
        folderId: parent,
      };
      if (options.access) input.access = options.access;
      if (cursor) input.cursor = cursor;
      if (search) input.search = search;
      const listSort = toSort(sort);
      if (listSort) input.sort = listSort;
      if (options.limit !== undefined) input.limit = pageLimit(options.limit);

      const page = await share.listShared(input, { signal });
      const locate = search
        ? locationsOf([
            ...(page.locations ?? []),
            ...(page.trail ?? []),
            ...(page.folders ?? []),
          ])
        : null;
      if (locate) {
        for (const object of page.objects) {
          locations.set(object, locate(object.folderId));
        }
      }
      return {
        items: page.objects,
        nextCursor: page.nextCursor,
        ...(page.folders && {
          folders: page.folders.map((folder) => ({
            id: folder.id,
            name: folder.name,
            ...(locate && { location: locate(folder.parentId) }),
          })),
        }),
        ...(page.trail && {
          trail: page.trail.map((folder) => ({
            id: folder.id,
            name: folder.name,
          })),
        }),
        ...(page.total !== undefined && { total: page.total }),
      };
    },
  };
}

/** Options of {@link downloadSharedFile}. */
export type DownloadSharedFileOptions = {
  token: string;
  access?: ShareAccess;
  /** `inline` opens the file in the tab, for a type the route allows inline. */
  disposition?: "inline" | "attachment";
  signal?: AbortSignal;
};

/**
 * Gets a download URL for one shared file and sends the browser to it. The
 * URL is short-lived, so it is fetched on each click. Counts one download.
 * Resolves with the `downloadShared` response, so a page can show the new
 * `downloadsLeft` without another `openLink`.
 *
 * ```tsx
 * <button onClick={() => downloadSharedFile(s3Client.share, file.id, { token, access })}>
 *   Download
 * </button>
 * ```
 */
export async function downloadSharedFile(
  share: Pick<ShareClientActions, "downloadShared">,
  id: string | undefined,
  options: DownloadSharedFileOptions,
): Promise<ShareDownloadResponse> {
  const response = await share.downloadShared(
    {
      token: options.token,
      ...(id !== undefined && { id }),
      ...(options.access !== undefined && { access: options.access }),
      ...(options.disposition !== undefined && {
        disposition: options.disposition,
      }),
    },
    { signal: options.signal },
  );
  // The browser's `location`, typed here so the package needs no DOM lib.
  const { location } = globalThis as unknown as {
    location: { assign: (url: string) => void };
  };
  location.assign(response.url);
  return response;
}
