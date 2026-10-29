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
    id: "roadmap",
    name: "Roadmap.pdf",
    folder: null,
    size: 860_160,
    type: "application/pdf",
  },
  {
    id: "pricing",
    name: "Pricing.xlsx",
    folder: null,
    size: 48_128,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    id: "kickoff",
    name: "Kickoff.mp4",
    folder: null,
    size: 4_194_304,
    type: "video/mp4",
  },
  {
    id: "contract",
    name: "Contract.docx",
    folder: null,
    size: 92_160,
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    id: "spec",
    name: "Product spec.md",
    folder: null,
    size: 18_432,
    type: "text/markdown",
  },
  {
    id: "budget",
    name: "Q4 budget.xlsx",
    folder: null,
    size: 61_440,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    id: "team",
    name: "Team.jpg",
    folder: null,
    size: 1_572_864,
    type: "image/jpeg",
  },
  {
    id: "release",
    name: "Release notes.txt",
    folder: null,
    size: 6_144,
    type: "text/plain",
  },
  {
    id: "proposal",
    name: "Proposal.pdf",
    folder: null,
    size: 737_280,
    type: "application/pdf",
  },
  {
    id: "film",
    name: "Brand film.mp4",
    folder: null,
    size: 6_291_456,
    type: "video/mp4",
  },
  {
    id: "a11y",
    name: "Accessibility.md",
    folder: null,
    size: 9_216,
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
    id: "q3",
    name: "Q3.pdf",
    folder: "Invoices",
    size: 487_424,
    type: "application/pdf",
  },
  {
    id: "q4",
    name: "Q4.pdf",
    folder: "Invoices",
    size: 552_960,
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
  {
    id: "icon",
    name: "Icon.png",
    folder: "Images",
    size: 24_576,
    type: "image/png",
  },
  {
    id: "social",
    name: "Social.png",
    folder: "Images",
    size: 409_600,
    type: "image/png",
  },
  {
    id: "texture",
    name: "Texture.jpg",
    folder: "Images",
    size: 890_880,
    type: "image/jpeg",
  },
  {
    id: "wordmark",
    name: "Wordmark.svg",
    folder: "Images",
    size: 8_192,
    type: "image/svg+xml",
  },
  {
    id: "portrait",
    name: "Portrait.jpg",
    folder: "Images",
    size: 1_245_184,
    type: "image/jpeg",
  },
  {
    id: "pattern",
    name: "Pattern.png",
    folder: "Images",
    size: 327_680,
    type: "image/png",
  },
];

const PAGE_SIZE = 4;
const PAGE_DELAY_MS = 400;
const USAGE_LIMITS = {
  maxBytes: 32 * 1024 * 1024,
  maxFiles: 40,
};

function catalogUsage(files: readonly LibraryFile[]) {
  return {
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    objectCount: files.length,
  };
}

function fileObjectKey(file: LibraryFile) {
  return file.key ?? `uploads/${file.id}/${file.name}`;
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
  const catalogRef = useRef(FILES);
  const list = useObjectList({
    query({ parent, cursor, signal }: ObjectListQueryInput) {
      const level = readObjectListLevel(catalogRef.current, {
        parent,
        getFolder: (file) => file.folder,
      });
      const start = cursor ? Number(cursor) : 0;
      const next = start + PAGE_SIZE;
      const page = {
        folders: level.folders,
        items: level.items.slice(start, next),
        nextCursor: next < level.items.length ? String(next) : null,
        usage: catalogUsage(catalogRef.current),
      };
      if (!cursor) return Promise.resolve(page);
      return delay(signal).then(() => page);
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
      usageLimits={USAGE_LIMITS}
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
      className="mx-auto max-w-lg"
      height="27rem"
    />
  );
}
