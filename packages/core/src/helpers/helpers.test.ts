import { describe, expect, it } from "vitest";
import { buildContentDisposition } from "./build-content-disposition";
import { buildObjectKey } from "./build-object-key";
import { formatFileSize } from "./format-file-size";
import { getFileExtension } from "./get-file-extension";
import { parseFileName } from "./parse-file-name";
import { sanitizeFileName } from "./sanitize-file-name";
import { truncateFileName } from "./truncate-file-name";

describe("sanitizeFileName", () => {
  it("replaces quotes, backslashes, newlines, and NUL", () => {
    expect(sanitizeFileName('a"b\\c\nd')).toBe("a_b_c_d");
    expect(sanitizeFileName("a\0b")).toBe("a_b");
  });
});

describe("buildContentDisposition / parseFileName", () => {
  it("round-trips unicode names via filename*", () => {
    const header = buildContentDisposition("фото.png");
    expect(header).toContain('filename="____.png"');
    expect(header).toContain("filename*=UTF-8''");
    expect(parseFileName(header)).toBe("фото.png");
  });

  it("falls back to quoted ASCII filename", () => {
    expect(parseFileName('attachment; filename="plain.txt"')).toBe("plain.txt");
  });

  it("returns undefined for missing or malformed headers", () => {
    expect(parseFileName(null)).toBeUndefined();
    expect(parseFileName("inline")).toBeUndefined();
  });
});

describe("formatFileSize", () => {
  it.each([
    [0, "0 B"],
    [1, "1 B"],
    [1024, "1.0 KB"],
    [1024 * 1024, "1.0 MB"],
  ])("formats %s", (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});

describe("truncateFileName", () => {
  it("leaves short names unchanged", () => {
    expect(truncateFileName("short.txt")).toBe("short.txt");
  });

  it("keeps the extension when truncating", () => {
    const name = `${"a".repeat(80)}.png`;
    const truncated = truncateFileName(name, 20);
    expect(truncated.endsWith(".png")).toBe(true);
    expect(truncated).toContain("…");
    expect(truncated.length).toBeLessThan(name.length);
  });

  it("truncates names without an extension", () => {
    const truncated = truncateFileName("a".repeat(80), 10);
    expect(truncated.endsWith("…")).toBe(true);
    expect(truncated.length).toBe(10);
  });
});

describe("getFileExtension", () => {
  it.each([
    ["photo.PNG", "png"],
    ["archive.tar.gz", "gz"],
    ["README", ""],
    [".gitignore", ""],
  ])("%s → %s", (name, ext) => {
    expect(getFileExtension(name)).toBe(ext);
  });
});

describe("buildObjectKey", () => {
  it("joins trimmed segments", () => {
    expect(buildObjectKey("/users/", "1", "/avatar.png")).toBe(
      "users/1/avatar.png",
    );
  });

  it("drops empty segments", () => {
    expect(buildObjectKey("", "a", "/", "b")).toBe("a/b");
  });
});
