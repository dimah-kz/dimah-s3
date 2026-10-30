"use client";

import { useRef, useState } from "react";
import {
  memoryObjectSource,
  useDelete,
  useDownload,
  useObjectList,
  useObjectListSelection,
  useUpload,
  type ObjectListSource,
} from "@dimah-s3/react";
import {
  ObjectList,
  ObjectListContent,
  ObjectListHeader,
  ObjectListSearch,
  ObjectListSortMenu,
  ObjectListUploadStatus,
  ObjectListUsage,
  ObjectListViewToggle,
  UploadButton,
} from "@dimah-s3/ui";
import {
  getDemoFileUrl,
  rememberDemoFile,
} from "@/lib/demo/client-object-store";

type LibraryFile = {
  id: string;
  name: string;
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
const USAGE_LIMITS = {
  maxBytes: 32 * 1024 * 1024,
  maxFiles: 40,
};

function fileObjectKey(file: LibraryFile) {
  return file.key ?? `uploads/${file.id}/${file.name}`;
}

/** Later pages wait a moment so the next-page spinner shows. */
function withPageDelay<TItem>(
  source: ObjectListSource<TItem>,
): ObjectListSource<TItem> {
  return {
    ...source,
    query: (input) =>
      input.cursor
        ? delay(input.signal).then(() => source.query(input))
        : source.query(input),
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
  const catalogRef = useRef(FILES);
  const [source] = useState(() =>
    withPageDelay(
      memoryObjectSource(() => catalogRef.current, {
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
        usage: true,
      }),
    ),
  );
  const list = useObjectList(source);
  const selection = useObjectListSelection(list, {
    isSelectable: () => true,
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
          updatedAt: new Date().toISOString(),
        },
      ];
    },
  });
  const download = useDownload({ route: "uploads" });
  const share = useDownload({ route: "uploads", disposition: "inline" });
  const remove = useDelete({
    route: "uploads",
    onSuccess: (key) => {
      catalogRef.current = catalogRef.current.filter(
        (file) => fileObjectKey(file) !== key,
      );
    },
  });

  return (
    <ObjectList
      list={list}
      selection={selection}
      upload={upload}
      download={download}
      share={share}
      delete={remove}
      usageLimits={USAGE_LIMITS}
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
      className="mx-auto max-w-2xl"
      height="28rem"
    >
      <ObjectListHeader>
        <ObjectListSearch className="max-sm:hidden" />
        <ObjectListSortMenu />
        <ObjectListViewToggle />
        <UploadButton upload={upload} size="sm" status={false} toast={false} />
      </ObjectListHeader>
      <ObjectListUsage />
      <ObjectListUploadStatus />
      <ObjectListContent />
    </ObjectList>
  );
}
