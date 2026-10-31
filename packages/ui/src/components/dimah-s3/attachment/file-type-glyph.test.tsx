import { describe, expect, it } from "vitest";
import { render } from "@/test/render";
import {
  FileTypeGlyph,
  resolveFileTypeExtension,
} from "@/components/dimah-s3/attachment/file-type-glyph";
import { FolderGlyph } from "@/components/dimah-s3/attachment/folder-glyph";

describe("resolveFileTypeExtension", () => {
  it("prefers a known content type over the extension", () => {
    expect(resolveFileTypeExtension("notes.txt", "application/pdf")).toBe(
      "pdf",
    );
    expect(resolveFileTypeExtension("photo", " IMAGE/JPEG ")).toBe("jpg");
  });

  it("falls back to the content type family", () => {
    expect(resolveFileTypeExtension("clip", "video/x-flv")).toBe("mp4");
    expect(resolveFileTypeExtension("song", "audio/ogg")).toBe("mp3");
  });

  it("reads the extension and its aliases", () => {
    expect(resolveFileTypeExtension("dir/Report.DOCX")).toBe("docx");
    expect(resolveFileTypeExtension("scan.tiff")).toBe("png");
    expect(resolveFileTypeExtension("bundle.7zip", "")).toBe("7z");
  });

  it("returns null for unknown or missing extensions", () => {
    expect(resolveFileTypeExtension("data.parquet")).toBeNull();
    expect(resolveFileTypeExtension(".env")).toBeNull();
    expect(resolveFileTypeExtension("README")).toBeNull();
    expect(
      resolveFileTypeExtension("archive.", "application/x-unknown"),
    ).toBeNull();
  });
});

describe("glyphs", () => {
  it("are hidden from assistive technology", () => {
    const { container } = render(
      <>
        <FileTypeGlyph fileName="report.pdf" />
        <FolderGlyph />
      </>,
    );

    const roots = Array.from(container.children);
    expect(roots).toHaveLength(2);
    for (const root of roots) {
      expect(root.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("labels the file glyph with the extension, known or not", () => {
    const { container, rerender } = render(
      <FileTypeGlyph fileName="notes" contentType="application/pdf" />,
    );
    expect(container.textContent).toBe("pdf");

    rerender(<FileTypeGlyph fileName="data.parquet" layout="icon" />);
    expect(container.textContent).toBe("parquet");
  });
});
