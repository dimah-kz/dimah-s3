"use client";

import { useState } from "react";
import { s3Error } from "@dimah-s3/core";
import {
  useDelete,
  useDownload,
  useObjectList,
  useObjectListSelection,
  useUpload,
  type ObjectListFolder,
  type ObjectListSource,
} from "@dimah-s3/react";
import { memoryObjectSource } from "@dimah-s3/react/engine";
import {
  ObjectList,
  ObjectListContent,
  ObjectListHeader,
  ObjectListSearch,
  ObjectListSortMenu,
  ObjectListUploadStatus,
  ObjectListUsage,
  ObjectListViewToggle,
  UploadTrigger,
} from "@dimah-s3/ui";
import {
  getDemoFileUrl,
  rememberDemoFile,
} from "@/lib/demo/client-object-store";

type LibraryFile = {
  id: string;
  name: string;
  /** `/`-separated folder path, or `null` for the root. */
  folder: string | null;
  size: number;
  type: string;
  updatedAt: string;
  key?: string;
};

const FILES: LibraryFile[] = [
  {
    id: "brand",
    name: "Brand-guidelines-final-approved-for-print-and-web-Q4-2026-do-not-rename.pdf",
    folder: null,
    size: 2_481_152,
    type: "application/pdf",
    updatedAt: "2026-06-08",
  },
  {
    id: "cover",
    name: "Cover.png",
    folder: null,
    size: 1_843_200,
    type: "image/png",
    updatedAt: "2026-02-15",
  },
  {
    id: "notes",
    name: "Launch notes.md",
    folder: null,
    size: 4_096,
    type: "text/markdown",
    updatedAt: "2026-07-22",
  },
  {
    id: "roadmap",
    name: "Roadmap.pdf",
    folder: null,
    size: 860_160,
    type: "application/pdf",
    updatedAt: "2026-03-01",
  },
  {
    id: "pricing",
    name: "Pricing.xlsx",
    folder: null,
    size: 48_128,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    updatedAt: "2026-08-08",
  },
  {
    id: "kickoff",
    name: "Kickoff.mp4",
    folder: null,
    size: 4_194_304,
    type: "video/mp4",
    updatedAt: "2026-04-15",
  },
  {
    id: "contract",
    name: "Contract.docx",
    folder: null,
    size: 92_160,
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    updatedAt: "2026-09-22",
  },
  {
    id: "spec",
    name: "Product spec.md",
    folder: null,
    size: 18_432,
    type: "text/markdown",
    updatedAt: "2026-05-01",
  },
  {
    id: "budget",
    name: "Q4 budget.xlsx",
    folder: null,
    size: 61_440,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    updatedAt: "2026-01-08",
  },
  {
    id: "team",
    name: "Team.jpg",
    folder: null,
    size: 1_572_864,
    type: "image/jpeg",
    updatedAt: "2026-06-15",
  },
  {
    id: "release",
    name: "Release notes.txt",
    folder: null,
    size: 6_144,
    type: "text/plain",
    updatedAt: "2026-02-22",
  },
  {
    id: "proposal",
    name: "Proposal.pdf",
    folder: null,
    size: 737_280,
    type: "application/pdf",
    updatedAt: "2026-07-01",
  },
  {
    id: "film",
    name: "Brand film.mp4",
    folder: null,
    size: 6_291_456,
    type: "video/mp4",
    updatedAt: "2026-03-08",
  },
  {
    id: "a11y",
    name: "Accessibility.md",
    folder: null,
    size: 9_216,
    type: "text/markdown",
    updatedAt: "2026-08-15",
  },
  {
    id: "q1",
    name: "Q1.pdf",
    folder: "Invoices",
    size: 524_288,
    type: "application/pdf",
    updatedAt: "2026-04-22",
  },
  {
    id: "q2",
    name: "Q2.pdf",
    folder: "Invoices",
    size: 610_304,
    type: "application/pdf",
    updatedAt: "2026-09-01",
  },
  {
    id: "q3",
    name: "Q3.pdf",
    folder: "Invoices",
    size: 487_424,
    type: "application/pdf",
    updatedAt: "2026-05-08",
  },
  {
    id: "q4",
    name: "Q4.pdf",
    folder: "Invoices",
    size: 552_960,
    type: "application/pdf",
    updatedAt: "2026-01-15",
  },
  {
    id: "receipt",
    name: "Receipt.png",
    folder: "Invoices/2026",
    size: 184_320,
    type: "image/png",
    updatedAt: "2026-06-22",
  },
  {
    id: "january",
    name: "January.pdf",
    folder: "Invoices/2026/January",
    size: 90_112,
    type: "application/pdf",
    updatedAt: "2026-02-01",
  },
  {
    id: "hero",
    name: "Hero.png",
    folder: "Images",
    size: 3_200_000,
    type: "image/png",
    updatedAt: "2026-07-08",
  },
  {
    id: "logo",
    name: "Logo.svg",
    folder: "Images",
    size: 12_288,
    type: "image/svg+xml",
    updatedAt: "2026-03-15",
  },
  {
    id: "icon",
    name: "Icon.png",
    folder: "Images",
    size: 24_576,
    type: "image/png",
    updatedAt: "2026-08-22",
  },
  {
    id: "social",
    name: "Social.png",
    folder: "Images",
    size: 409_600,
    type: "image/png",
    updatedAt: "2026-04-01",
  },
  {
    id: "texture",
    name: "Texture.jpg",
    folder: "Images",
    size: 890_880,
    type: "image/jpeg",
    updatedAt: "2026-09-08",
  },
  {
    id: "wordmark",
    name: "Wordmark.svg",
    folder: "Images",
    size: 8_192,
    type: "image/svg+xml",
    updatedAt: "2026-05-15",
  },
  {
    id: "portrait",
    name: "Portrait.jpg",
    folder: "Images",
    size: 1_245_184,
    type: "image/jpeg",
    updatedAt: "2026-01-22",
  },
  {
    id: "pattern",
    name: "Pattern.png",
    folder: "Images",
    size: 327_680,
    type: "image/png",
    updatedAt: "2026-06-01",
  },
];

const PAGE_SIZE = 6;
const PAGE_DELAY_MS = 400;
const LIMITS = {
  maxBytes: 32 * 1024 * 1024,
  maxFiles: 40,
};

function fileObjectKey(file: LibraryFile) {
  return file.key ?? `uploads/${file.id}/${file.name}`;
}

function isInFolder(path: string | null, folder: string) {
  return path === folder || (path?.startsWith(`${folder}/`) ?? false);
}

/** Folder ids are paths. A rename rewrites that path and everything inside it. */
function rewriteFolderPath(path: string, from: string, to: string) {
  if (path === from) return to;
  const prefix = `${from}/`;
  if (!path.startsWith(prefix)) return path;
  return to + path.slice(from.length);
}

/** The demo's records. Uploads, deletes, renames, and New folder edit them. */
function createCatalog() {
  let files = FILES;
  /** Folders made with New folder. They stay listed while empty. */
  let folders = new Set<string>();
  return {
    files: () => files,
    add(file: LibraryFile) {
      files = [...files, file];
    },
    remove(objectKey: string) {
      files = files.filter((file) => fileObjectKey(file) !== objectKey);
    },
    /** Created folders that sit directly in `parent`. */
    emptyFolders(parent: string | null): ObjectListFolder[] {
      const prefix = parent ? `${parent}/` : "";
      return [...folders]
        .filter((id) => id.startsWith(prefix))
        .map((id) => ({ id, name: id.slice(prefix.length) }))
        .filter((folder) => !folder.name.includes("/"));
    },
    renameFile(id: string, name: string): LibraryFile {
      const current = files.find((file) => file.id === id);
      if (!current) throw s3Error("OBJECT_NOT_FOUND");
      // Pin the key before the name changes, so download still finds the blob.
      const next: LibraryFile = {
        ...current,
        name,
        key: current.key ?? fileObjectKey(current),
      };
      files = files.map((file) => (file.id === id ? next : file));
      return next;
    },
    renameFolder(id: string, input: string): ObjectListFolder {
      const name = input.trim();
      if (!name || name === "." || name === ".." || name.includes("/")) {
        throw s3Error("FOLDER_INVALID");
      }
      const parent = id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : null;
      const nextId = parent ? `${parent}/${name}` : name;
      if (nextId === id) return { id, name };
      const known =
        folders.has(id) || files.some((file) => isInFolder(file.folder, id));
      if (!known) throw s3Error("FOLDER_NOT_FOUND");
      const taken =
        folders.has(nextId) ||
        files.some((file) => isInFolder(file.folder, nextId));
      if (taken) throw s3Error("FOLDER_EXISTS");
      files = files.map((file) =>
        file.folder == null
          ? file
          : { ...file, folder: rewriteFolderPath(file.folder, id, nextId) },
      );
      folders = new Set(
        [...folders].map((folderId) => rewriteFolderPath(folderId, id, nextId)),
      );
      return { id: nextId, name };
    },
    createFolder(parent: string | null, input: string): ObjectListFolder {
      const name = input.trim();
      if (!name || name === "." || name === ".." || name.includes("/")) {
        throw s3Error("FOLDER_INVALID");
      }
      const id = parent ? `${parent}/${name}` : name;
      const exists =
        folders.has(id) || files.some((file) => isInFolder(file.folder, id));
      if (exists) throw s3Error("CONFLICT");
      folders = new Set(folders).add(id);
      return { id, name };
    },
  };
}

type Catalog = ReturnType<typeof createCatalog>;

/**
 * The list source. `memoryObjectSource` reads folders from the records, so
 * this adds the created folders that hold no file yet, renames files and
 * folders, uploads into the open folder or the folder a file is dropped
 * on, and makes later pages wait a moment so the next-page spinner shows.
 */
function createSource(catalog: Catalog): ObjectListSource<LibraryFile> {
  const source = memoryObjectSource(catalog.files, {
    getKey: (file) => file.id,
    getFile: (file) => ({
      name: file.name,
      objectKey: fileObjectKey(file),
      size: file.size,
      contentType: file.type,
      updatedAt: file.updatedAt,
      previewUrl: file.type.startsWith("image/")
        ? getDemoFileUrl(fileObjectKey(file))
        : null,
    }),
    getFolder: (file) => file.folder,
    pageSize: PAGE_SIZE,
    limits: LIMITS,
  });

  return {
    ...source,
    async query(input) {
      if (input.cursor) await delay(input.signal);
      const page = await source.query(input);
      if (!page.folders) return page;
      const search = input.search.toLowerCase();
      const listed = new Set(page.folders.map((folder) => folder.id));
      const extra = catalog
        .emptyFolders(input.parent)
        .filter((folder) => !listed.has(folder.id))
        .filter((folder) => folder.name.toLowerCase().includes(search));
      if (extra.length === 0) return page;
      const folders = [...page.folders, ...extra].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
      if (input.sort?.field === "name" && input.sort.direction === "desc") {
        folders.reverse();
      }
      return { ...page, folders };
    },
    // Sent as client metadata. A real route reads it in `object()`.
    uploadOptions: (parent) => ({ metadata: { folder: parent ?? "" } }),
    createFolder: async ({ parent, name }) =>
      catalog.createFolder(parent, name),
    renameFile: async ({ item, name }) => catalog.renameFile(item.id, name),
    renameFolder: async ({ folder, name }) =>
      catalog.renameFolder(folder.id, name),
  };
}

function delay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timer = window.setTimeout(finish, PAGE_DELAY_MS);
    function finish() {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }
    function onAbort() {
      window.clearTimeout(timer);
      reject(abortError());
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

export function ObjectListDemo() {
  const [catalog] = useState(createCatalog);
  const [source] = useState(() => createSource(catalog));
  const list = useObjectList(source);
  const selection = useObjectListSelection(list, {
    isSelectable: () => true,
  });
  const upload = useUpload({
    route: "uploads",
    maxFiles: 8,
    queue: true,
    onSuccess: (result, file) => {
      rememberDemoFile(result.key, file);
      // The demo API echoes the request metadata, so the folder comes back.
      const folder = result.metadata.folder || null;
      catalog.add({
        id: result.key,
        key: result.key,
        name: result.name ?? file.name,
        folder,
        size: result.size,
        type: result.type || "application/octet-stream",
        updatedAt: result.lastModified ?? new Date().toISOString(),
      });
    },
  });
  const download = useDownload({ route: "uploads" });
  const share = useDownload({ route: "uploads", disposition: "inline" });
  const remove = useDelete({
    route: "uploads",
    onSuccess: (_data, key) => catalog.remove(key),
  });

  return (
    <ObjectList
      list={list}
      selection={selection}
      upload={upload}
      download={download}
      share={share}
      delete={remove}
      resolveFolderKeys={async (folder) =>
        catalog
          .files()
          .filter((file) => isInFolder(file.folder, folder.id))
          .map(fileObjectKey)
      }
      onOpenItem={(file) => {
        void share
          .presign(fileObjectKey(file), { fileName: file.name })
          .then((outcome) => {
            if (outcome.status !== "success") return;
            window.open(outcome.data.url, "_blank", "noopener,noreferrer");
          });
      }}
      className="mx-auto max-w-2xl"
      height="28rem"
    >
      <ObjectListHeader>
        <ObjectListSearch />
        <ObjectListSortMenu />
        <ObjectListViewToggle />
        <UploadTrigger size="sm" />
      </ObjectListHeader>
      <ObjectListUsage />
      <ObjectListUploadStatus />
      <ObjectListContent />
    </ObjectList>
  );
}
