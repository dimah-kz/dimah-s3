import { describe, expect, it } from "vitest";
import { formatAcceptLabels } from "./format-accept-labels";
import { formatSpeed } from "./format-speed";
import { formatUploadProgress } from "./format-upload-progress";

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
    expect(formatAcceptLabels([".jpg", ".jpeg"])).toEqual(["JPEG"]);
  });

  it("returns an empty list when accept is omitted", () => {
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
