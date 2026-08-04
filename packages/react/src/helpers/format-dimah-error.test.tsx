import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { DimahS3Error } from "@dimah-s3/core";
import { TranslationProvider } from "@fuma-translate/react";
import { useFormatDimahError } from "./format-dimah-error";

function captureFormatter(): (err: unknown) => string {
  let format!: (err: unknown) => string;
  const host = document.createElement("div");
  const root = createRoot(host);

  function Probe() {
    format = useFormatDimahError();
    return null;
  }

  act(() => {
    root.render(
      <TranslationProvider translations={{}}>
        <Probe />
      </TranslationProvider>,
    );
  });
  act(() => {
    root.unmount();
  });

  return format;
}

describe("useFormatDimahError", () => {
  it("maps coded errors to English source strings", () => {
    const format = captureFormatter();
    expect(
      format(new DimahS3Error("ignored", 400, { code: "KEY_REQUIRED" })),
    ).toBe("Object key is required");
  });

  it("interpolates params", () => {
    const format = captureFormatter();
    expect(
      format(
        new DimahS3Error("ignored", 400, {
          code: "FIELD_REQUIRED",
          params: { name: "uploadId" },
        }),
      ),
    ).toBe("uploadId is required");
  });

  it("falls back for unknown errors", () => {
    const format = captureFormatter();
    expect(format(new Error("boom"))).toBe("boom");
    expect(format("x")).toBe("Unknown error");
  });
});
