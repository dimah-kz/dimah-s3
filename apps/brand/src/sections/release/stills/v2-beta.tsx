"use client";

import { useState } from "react";
import { useObjectList } from "@dimah-s3/react";
import { memoryObjectSource } from "@dimah-s3/react/engine";
import {
  ObjectList,
  ObjectListContent,
  ObjectListHeader,
  ObjectListSearch,
  ObjectListSortMenu,
  ObjectListViewToggle,
} from "@dimah-s3/ui";
import { TWEET_LANDSCAPE } from "@/catalog";
import { BrandFrame } from "@/lib/frame";
import { BrandMark } from "@/lib/mark";

type LibraryFile = {
  id: string;
  name: string;
  folder: string | null;
  size: number;
  type: string;
  updatedAt: string;
};

const FILES: LibraryFile[] = [
  {
    id: "hero",
    name: "Hero.png",
    folder: "Images",
    size: 3_200_000,
    type: "image/png",
    updatedAt: "2026-10-28",
  },
  {
    id: "q4",
    name: "Q4.pdf",
    folder: "Invoices",
    size: 552_960,
    type: "application/pdf",
    updatedAt: "2026-10-02",
  },
  {
    id: "roadmap",
    name: "Roadmap.pdf",
    folder: null,
    size: 860_160,
    type: "application/pdf",
    updatedAt: "2026-11-04",
  },
  {
    id: "pricing",
    name: "Pricing.xlsx",
    folder: null,
    size: 48_128,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    updatedAt: "2026-11-02",
  },
  {
    id: "kickoff",
    name: "Kickoff.mp4",
    folder: null,
    size: 4_194_304,
    type: "video/mp4",
    updatedAt: "2026-10-30",
  },
  {
    id: "notes",
    name: "Launch notes.md",
    folder: null,
    size: 4_096,
    type: "text/markdown",
    updatedAt: "2026-10-21",
  },
];

function createSource() {
  return memoryObjectSource(FILES, {
    getKey: (file) => file.id,
    getFile: (file) => ({
      name: file.name,
      objectKey: `uploads/${file.id}/${file.name}`,
      size: file.size,
      contentType: file.type,
      updatedAt: file.updatedAt,
    }),
    getFolder: (file) => file.folder,
  });
}

export function ReleaseV2BetaStill() {
  const [source] = useState(createSource);
  const list = useObjectList(source);

  return (
    <BrandFrame size={TWEET_LANDSCAPE} className="gap-9">
      <div className="flex items-center gap-3">
        <BrandMark className="size-9 [&_svg]:size-5" />
        <span className="text-[26px] font-semibold tracking-tight text-[#09090b]">
          dimah-s3
        </span>
        <span className="rounded-full bg-zinc-950 px-2.5 py-1.5 text-[14px] leading-none font-medium text-white">
          v2 beta
        </span>
      </div>
      <div className="w-[600px]" style={{ zoom: 1.3 }}>
        <ObjectList
          list={list}
          toasts={false}
          className="shadow-[0_1px_1px_rgba(24,24,27,0.04),0_12px_32px_rgba(24,24,27,0.08),0_32px_64px_-16px_rgba(24,24,27,0.22)] transition-none"
        >
          <ObjectListHeader>
            <ObjectListSearch />
            <ObjectListSortMenu />
            <ObjectListViewToggle />
          </ObjectListHeader>
          <ObjectListContent />
        </ObjectList>
      </div>
    </BrandFrame>
  );
}
