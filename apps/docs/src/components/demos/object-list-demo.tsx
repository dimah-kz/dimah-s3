"use client";

import { formatFileSize } from "@dimah-s3/core";
import {
  readObjectListLevel,
  useObjectList,
  type ObjectListQueryInput,
} from "@dimah-s3/react";
import { ObjectList } from "@dimah-s3/ui";

type LibraryFile = {
  id: string;
  name: string;
  folder: string | null;
  size: number;
  type: string;
};

const FILES: LibraryFile[] = [
  {
    id: "brand",
    name: "Brand guide.pdf",
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

function query({ parent, cursor }: ObjectListQueryInput) {
  const level = readObjectListLevel(FILES, {
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
}

export function ObjectListDemo() {
  const list = useObjectList({ query });

  return (
    <ObjectList
      list={list}
      getKey={(file) => file.id}
      getLabel={(file) => file.name}
      getDescription={(file) => formatFileSize(file.size)}
      getFileType={(file) => file.type}
      className="mx-auto max-w-lg"
    />
  );
}
