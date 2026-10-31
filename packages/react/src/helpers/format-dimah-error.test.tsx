import { describe, expect, it } from "vitest";
import { TranslationProvider } from "@fuma-translate/react";
import {
  APIError,
  S3_ERROR_CODES,
  s3Error,
  validateFile,
  type S3ErrorCode,
} from "@dimah-s3/core";
import { S3LocaleContext } from "@/s3-provider";
import { renderHook, renderHookWithI18n } from "@/test/render-hook";
import { useFormatDimahError } from "./format-dimah-error";

describe("useFormatDimahError", () => {
  it.each(Object.keys(S3_ERROR_CODES) as S3ErrorCode[])(
    "has its own message for %s",
    (code) => {
      const format = renderHookWithI18n(useFormatDimahError);
      const message = format(
        APIError.fromShape({ code, message: "server message" }),
      );
      expect(message).not.toBe("server message");
      expect(message).not.toBe("");
    },
  );

  it("maps codes to English source strings", () => {
    const format = renderHookWithI18n(useFormatDimahError);
    expect(format(s3Error("OBJECT_NOT_FOUND"))).toBe("File not found");
    expect(format(s3Error("FORBIDDEN"))).toBe("Access denied");
    expect(format(s3Error("NETWORK_ERROR"))).toBe("Network error");
    expect(format(s3Error("UPLOAD_TICKET_EXPIRED"))).toBe(
      "Upload session has expired",
    );
    expect(format(s3Error("HOOK_FAILED", { hook: "beforeUpload" }))).toBe(
      "Something went wrong",
    );
  });

  it("fills params", () => {
    const format = renderHookWithI18n(useFormatDimahError);
    expect(format(s3Error("S3_NETWORK_ERROR", { code: "ECONNREFUSED" }))).toBe(
      "Could not reach storage (ECONNREFUSED)",
    );
    expect(format(s3Error("MULTIPART_PART_MISSING", { partNumber: 3 }))).toBe(
      "Uploaded part 3 was not found",
    );
    expect(format(s3Error("TOO_MANY_FILES", { maxFiles: 5 }))).toBe(
      "Too many files (max 5)",
    );
    expect(format(s3Error("PARTIAL_FAILURE", { failed: 2, total: 7 }))).toBe(
      "2 of 7 failed",
    );
    expect(format(s3Error("FEATURE_DISABLED", { feature: "download" }))).toBe(
      "Downloads are disabled",
    );
    expect(format(s3Error("QUOTA_EXCEEDED", { limit: "files" }))).toBe(
      "File limit reached",
    );
    expect(format(s3Error("QUOTA_EXCEEDED", { limit: "bytes" }))).toBe(
      "Storage quota exceeded",
    );
  });

  it("formats validateFile errors", () => {
    const format = renderHookWithI18n(useFormatDimahError);
    const file = (name: string, size: number, type = "") =>
      new File([new Uint8Array(size)], name, { type });

    expect(format(validateFile(file("a.exe", 1), { accept: [".png"] }))).toBe(
      'File type ".exe" is not allowed',
    );
    expect(format(validateFile(file("a.png", 0), {}))).toBe("File is empty");
    expect(
      format(validateFile(file("a.png", 2048), { maxFileSize: 1024 })),
    ).toBe("File size exceeds 1.0 KB limit");
  });

  it("uses the generic message when params are missing", () => {
    const format = renderHookWithI18n(useFormatDimahError);
    expect(
      format(APIError.fromShape({ code: "FILE_TOO_LARGE", message: "x" })),
    ).toBe("File is too large");
    expect(
      format(APIError.fromShape({ code: "S3_NETWORK_ERROR", message: "x" })),
    ).toBe("Could not reach storage");
    expect(
      format(APIError.fromShape({ code: "FEATURE_DISABLED", message: "x" })),
    ).toBe("This feature is disabled");
  });

  it("reads the code from a raw better-call error body", () => {
    const format = renderHookWithI18n(useFormatDimahError);
    // better-call copies keep the code only on `body`.
    const error = Object.assign(new Error("Object not found"), {
      name: "APIError",
      body: { code: "OBJECT_NOT_FOUND", message: "Object not found" },
    });
    expect(format(error)).toBe("File not found");
  });

  it("returns the message for other codes and errors", () => {
    const format = renderHookWithI18n(useFormatDimahError);
    expect(
      format(APIError.from(400, { code: "CUSTOM", message: "custom" })),
    ).toBe("custom");
    expect(format(new Error("boom"))).toBe("boom");
    expect(format("x")).toBe("Something went wrong");
  });

  it("follows the provider locale and translations", () => {
    const hook = renderHook(useFormatDimahError, {
      wrapper: ({ children }) => (
        <S3LocaleContext.Provider value="fa">
          <TranslationProvider
            translations={{
              "Too many files (max {maxFiles})(API error)":
                "حداکثر {maxFiles} فایل",
            }}
          >
            {children}
          </TranslationProvider>
        </S3LocaleContext.Provider>
      ),
    });
    expect(hook.current(s3Error("TOO_MANY_FILES", { maxFiles: 12 }))).toBe(
      "حداکثر ۱۲ فایل",
    );
    hook.unmount();
  });
});
