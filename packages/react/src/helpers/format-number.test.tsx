import { describe, expect, it } from "vitest";
import { TranslationProvider } from "@fuma-translate/react";
import { renderHook } from "@/test/render-hook";
import { S3LocaleContext } from "@/s3-provider";
import { useFormatFileSize, useFormatNumber } from "./format-number";

describe("useFormatFileSize / useFormatNumber", () => {
  it("keeps Latin digits and English units without a locale", () => {
    const hook = renderHook(() => ({
      size: useFormatFileSize(),
      number: useFormatNumber(),
    }));
    expect(hook.current.size(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(hook.current.number(1200)).toBe("1200");
    hook.unmount();
  });

  it("follows the provider locale and translated units", () => {
    const hook = renderHook(
      () => ({ size: useFormatFileSize(), number: useFormatNumber() }),
      {
        wrapper: ({ children }) => (
          <S3LocaleContext.Provider value="fa">
            <TranslationProvider
              translations={{ "MB(file size unit)": "مگابایت" }}
            >
              {children}
            </TranslationProvider>
          </S3LocaleContext.Provider>
        ),
      },
    );
    expect(hook.current.size(1.5 * 1024 * 1024)).toBe("۱٫۵ مگابایت");
    expect(hook.current.number(12)).toBe("۱۲");
    hook.unmount();
  });
});
