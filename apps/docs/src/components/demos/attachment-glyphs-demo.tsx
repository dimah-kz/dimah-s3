"use client";

import { CircleProgress, FileTypeGlyph, FolderGlyph } from "@dimah-s3/ui";

const FILES = [
  ["report.pdf", "application/pdf"],
  ["notes.docx", null],
  ["budget.xlsx", null],
  ["slides.pptx", null],
  ["data.csv", "text/csv"],
  ["archive.zip", "application/zip"],
  ["photo.jpg", "image/jpeg"],
  ["song.mp3", "audio/mpeg"],
  ["clip.mp4", "video/mp4"],
  ["app.ts", null],
  ["README.md", null],
  ["unknown.bin", null],
] as const;

export function AttachmentGlyphsDemo() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <ul className="grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-7">
        <li className="flex flex-col items-center gap-1.5">
          <FolderGlyph className="size-8" />
          <span className="text-xs text-muted-foreground">Folder</span>
        </li>
        {FILES.map(([name, type]) => (
          <li key={name} className="flex flex-col items-center gap-1.5">
            <FileTypeGlyph layout="icon" fileName={name} contentType={type} />
            <span className="max-w-full truncate text-xs text-muted-foreground">
              {name}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-center gap-6">
        {[0, 25, 50, 75, 100].map((percent) => (
          <div key={percent} className="flex flex-col items-center gap-1.5">
            <CircleProgress
              percent={percent}
              fileName="example.pdf"
              className="size-6"
            />
            <span className="text-xs text-muted-foreground tabular-nums">
              {percent}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
