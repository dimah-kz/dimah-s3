import { describe, expect, it } from "vitest";
import { render } from "@/test/render";
import {
  FileTypeGlyph,
  resolveFileTypeGlyph,
} from "@/components/dimah-s3/attachment/file-type-glyph";
import { FolderGlyph } from "@/components/dimah-s3/attachment/folder-glyph";

describe("resolveFileTypeGlyph", () => {
  it("prefers a known content type over the extension", () => {
    expect(resolveFileTypeGlyph("notes.txt", "application/pdf")).toEqual({
      label: "pdf",
      styles: expect.objectContaining({ type: "acrobat" }),
    });
    expect(resolveFileTypeGlyph("photo", " IMAGE/JPEG ").label).toBe("jpg");
  });

  it("labels a file with its own extension, never another type's", () => {
    expect(resolveFileTypeGlyph("song.flac").label).toBe("flac");
    expect(resolveFileTypeGlyph("scan.tiff").label).toBe("tiff");
    expect(resolveFileTypeGlyph("clip.avi").label).toBe("avi");
    expect(resolveFileTypeGlyph("dir/Report.DOCX").label).toBe("docx");
    expect(resolveFileTypeGlyph("bundle.7z", "").styles).toMatchObject({
      type: "compressed",
    });
  });

  it("styles an unknown type by its family, without a label", () => {
    expect(resolveFileTypeGlyph("clip", "video/x-flv")).toEqual({
      label: null,
      styles: { type: "video" },
    });
    expect(resolveFileTypeGlyph("photo.avif", "image/avif")).toEqual({
      label: "avif",
      styles: { type: "image" },
    });
  });

  it("draws a plain document for an unknown or missing extension", () => {
    expect(resolveFileTypeGlyph("data.parquet")).toEqual({
      label: "parquet",
      styles: { type: "document" },
    });
    expect(resolveFileTypeGlyph(".env").label).toBeNull();
    expect(resolveFileTypeGlyph("README").label).toBeNull();
    expect(resolveFileTypeGlyph("archive.", "application/x-unknown")).toEqual({
      label: null,
      styles: { type: "document" },
    });
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
