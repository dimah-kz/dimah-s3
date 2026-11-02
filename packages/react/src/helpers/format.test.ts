import { describe, expect, it } from "vitest";
import { formatAcceptLabels } from "./format-accept-labels";
import { formatFileSize } from "./format-file-size";
import { formatSpeed } from "./format-speed";
import { formatUploadProgress } from "./format-upload-progress";
import { truncateFileName } from "./truncate-file-name";

describe("formatFileSize", () => {
  it.each([
    [0, "0 B"],
    [1, "1 B"],
    [1024, "1.0 KB"],
    [1024 * 1024, "1.0 MB"],
  ])("formats %s", (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });

  it("guards non-finite, negative, and oversized values", () => {
    expect(formatFileSize(-1)).toBe("0 B");
    expect(formatFileSize(Number.NaN)).toBe("0 B");
    expect(formatFileSize(Number.POSITIVE_INFINITY)).toBe("0 B");
    expect(formatFileSize(1024 ** 6)).toBe("1.0 EB");
    expect(formatFileSize(Number.MAX_VALUE).endsWith(" EB")).toBe(true);
  });

  it("picks the unit after rounding", () => {
    expect(formatFileSize(1_048_575)).toBe("1.0 MB");
    expect(formatFileSize(1023)).toBe("1023 B");
  });

  it("uses locale digits and unit labels", () => {
    expect(
      formatFileSize(1.5 * 1024 * 1024, {
        locale: "fa",
        units: { MB: "مگابایت" },
      }),
    ).toBe("۱٫۵ مگابایت");
    expect(formatFileSize(1023, { locale: "de" })).toBe("1023 B");
    expect(formatFileSize(1536, { locale: "de" })).toBe("1,5 KB");
  });
});

describe("truncateFileName", () => {
  it("leaves short names unchanged", () => {
    expect(truncateFileName("short.txt")).toBe("short.txt");
  });

  it("truncates to at most maxChars, keeping the extension", () => {
    const short = truncateFileName("a-very-long-file-name-here.pdf", 20);
    expect(Array.from(short)).toHaveLength(20);
    expect(short).toBe("a-very-long-fil….pdf");
  });

  it("truncates names without an extension and never splits a code point", () => {
    const truncated = truncateFileName("a".repeat(80), 10);
    expect(truncated.endsWith("…")).toBe(true);
    expect(truncated).toHaveLength(10);
    expect(Array.from(truncateFileName("😀".repeat(30), 10))).toHaveLength(10);
  });
});

describe("formatSpeed", () => {
  it("appends /s to a file size", () => {
    expect(formatSpeed(1024)).toBe("1.0 KB/s");
    expect(formatSpeed(512)).toBe("512 B/s");
  });
});

describe("formatAcceptLabels", () => {
  it("normalizes extensions, wildcards, and MIME subtypes", () => {
    expect(formatAcceptLabels([".png", "image/*", "application/pdf"])).toEqual([
      "PNG",
      "Images",
      "PDF",
    ]);
  });

  it("dedupes jpeg aliases", () => {
    expect(formatAcceptLabels([".jpg", ".jpeg", "image/jpeg"])).toEqual([
      "JPEG",
    ]);
  });

  it("labels groups in English, or with the given groups", () => {
    expect(
      formatAcceptLabels(["audio/*", "text/*", "model/*", "video/*"]),
    ).toEqual(["Audio", "Text files", "Model files", "Videos"]);
    expect(
      formatAcceptLabels(["image/*", "video/*"], {
        groups: { image: "Bilder" },
      }),
    ).toEqual(["Bilder", "Videos"]);
  });

  it("names long and prefixed MIME types by their file type", () => {
    expect(
      formatAcceptLabels([
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/svg+xml",
        "application/x-tar",
        "application/vnd.rar",
        "TEXT/PLAIN",
      ]),
    ).toEqual(["DOCX", "SVG", "TAR", "RAR", "TXT"]);
  });

  it("returns no label for any-type wildcards or an empty list", () => {
    expect(formatAcceptLabels(["*", "*/*", " "])).toEqual([]);
    expect(formatAcceptLabels()).toEqual([]);
    expect(formatAcceptLabels([])).toEqual([]);
  });
});

describe("formatUploadProgress", () => {
  it("includes the total and percent when known", () => {
    expect(formatUploadProgress(1_200_000, 5_600_000, 21)).toBe(
      "1.1 MB / 5.3 MB (21%)",
    );
  });

  it("shows only loaded bytes when total is unknown", () => {
    expect(formatUploadProgress(1024, 0, 0)).toBe("1.0 KB");
  });
});
