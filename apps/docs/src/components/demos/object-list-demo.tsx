"use client";

import { useRef } from "react";
import { formatFileSize } from "@dimah-s3/core";
import {
  readObjectListLevel,
  useDelete,
  useDownload,
  useObjectList,
  useUpload,
  type ObjectListQueryInput,
} from "@dimah-s3/react";
import { ObjectList, ObjectListMenu, UploadButton } from "@dimah-s3/ui";
import { rememberDemoFile } from "@/lib/demo/client-object-store";

type LibraryFile = {
  id: string;
  name: string;
  folder: string | null;
  size: number;
  type: string;
  key?: string;
};

const FILES: LibraryFile[] = [
  {
    id: "brand",
    name: "Brand-guidelines-final-approved-for-print-and-web-Q4-2026-do-not-rename.pdf",
    folder: null,
    size: 2_481_152,
    type: "application/pdf",
  },
  {
    id: "cover",
    name: "Cover.png",
    folder: null,
    size: 1_843_200,
    type: "image/png",
  },
  {
    id: "notes",
    name: "Launch notes.md",
    folder: null,
    size: 4_096,
    type: "text/markdown",
  },
  {
    id: "q1",
    name: "Q1.pdf",
    folder: "Invoices",
    size: 524_288,
    type: "application/pdf",
  },
  {
    id: "q2",
    name: "Q2.pdf",
    folder: "Invoices",
    size: 610_304,
    type: "application/pdf",
  },
  {
    id: "receipt",
    name: "Receipt.png",
    folder: "Invoices/2026",
    size: 184_320,
    type: "image/png",
  },
  {
    id: "january",
    name: "January.pdf",
    folder: "Invoices/2026/January",
    size: 90_112,
    type: "application/pdf",
  },
  {
    id: "hero",
    name: "Hero.png",
    folder: "Images",
    size: 3_200_000,
    type: "image/png",
  },
  {
    id: "logo",
    name: "Logo.svg",
    folder: "Images",
    size: 12_288,
    type: "image/svg+xml",
  },
];

const PAGE_SIZE = 2;

function fileObjectKey(file: LibraryFile) {
  return file.key ?? `uploads/${file.id}/${file.name}`;
}

export function ObjectListDemo() {
  const catalogRef = useRef(FILES);
  const list = useObjectList({
    query({ parent, cursor }: ObjectListQueryInput) {
      const level = readObjectListLevel(catalogRef.current, {
        parent,
        getFolder: (file) => file.folder,
      });
      const start = cursor ? Number(cursor) : 0;
      const next = start + PAGE_SIZE;
      return Promise.resolve({
        folders: level.folders,
        items: level.items.slice(start, next),
        nextCursor: next < level.items.length ? String(next) : null,
      });
    },
  });
  const upload = useUpload({
    route: "uploads",
    maxFiles: 8,
    noClick: true,
    noKeyboard: true,
    getUploadOptions: () => ({
      metadata: { folderId: list.parent ?? "" },
    }),
    onFileSuccess: (file, result) => {
      rememberDemoFile(result.key, file);
      catalogRef.current = [
        ...catalogRef.current,
        {
          id: result.key,
          key: result.key,
          name: file.name,
          folder: list.parent,
          size: file.size,
          type: file.type || "application/octet-stream",
        },
      ];
    },
  });
  const download = useDownload({ route: "uploads" });
  const share = useDownload({ route: "uploads", disposition: "inline" });
  const remove = useDelete({ route: "uploads" });

  return (
    <ObjectList
      list={list}
      getKey={(file) => file.id}
      getObjectKey={fileObjectKey}
      getLabel={(file) => file.name}
      getDescription={(file) => formatFileSize(file.size)}
      getFileType={(file) => file.type}
      upload={upload}
      header={
        <UploadButton upload={upload} size="sm" status={false} toast={false} />
      }
      delete={remove}
      resolveFolderKeys={async (folder) =>
        catalogRef.current
          .filter(
            (file) =>
              file.folder === folder.id ||
              file.folder?.startsWith(`${folder.id}/`),
          )
          .map(fileObjectKey)
      }
      onOpenItem={(file) => {
        void share.presign(fileObjectKey(file), file.name).then((signed) => {
          if (signed) window.open(signed.url, "_blank", "noopener,noreferrer");
        });
      }}
      renderActions={(file) => (
        <ObjectListMenu
          objectKey={fileObjectKey(file)}
          fileName={file.name}
          fileSize={file.size}
          download={download}
          share={share}
          delete={remove}
          onDeleted={() => void list.refresh()}
        />
      )}
      className="mx-auto h-72 max-w-lg **:[[role=list]]:min-h-0 **:[[role=list]]:flex-1 **:[[role=list]]:overflow-y-auto **:[[role=list]]:overscroll-contain"
    />
  );
}
